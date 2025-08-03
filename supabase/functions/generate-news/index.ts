
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateThumbnailImage(title: string, openAIApiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: `Create a professional news thumbnail image representing: ${title}. Style: clean, modern, news-worthy, high contrast, readable text overlay possible`,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      }),
    });

    if (!response.ok) {
      console.error('OpenAI image generation failed:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.url || null;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    // Get the request body to check for specific group ID
    const body = await req.json().catch(() => ({}));
    const { groupId } = body;

    let groups;
    if (groupId) {
      // Generate news for specific group
      const { data: groupData, error: groupError } = await supabaseClient
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .eq('automated_news_enabled', true)
        .maybeSingle();

      if (groupError) {
        console.error('Error fetching group:', groupError);
        throw groupError;
      }
      
      if (!groupData) {
        console.log(`Group not found or automated news not enabled for group: ${groupId}`);
        return new Response(JSON.stringify({ 
          message: 'Group not found or automated news not enabled', 
          results: [] 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      groups = [groupData];
    } else {
      // Get all groups with automated news enabled (for scheduled generation)
      const { data: groupsData, error: groupsError } = await supabaseClient
        .from('groups')
        .select('*')
        .eq('automated_news_enabled', true);

      if (groupsError) {
        console.error('Error fetching groups:', groupsError);
        throw groupsError;
      }
      groups = groupsData;
    }

    const results = [];

    for (const group of groups || []) {
      try {
        // Generate news using Perplexity with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        let newsContent;
        try {
          const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${perplexityApiKey}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'sonar-pro',
              messages: [
                {
                  role: 'system',
                  content: 'You are a news curator. Always include the full source URL for each article. Focus on recent, credible news sources.'
                },
                {
                  role: 'user',
                  content: `Find the ${group.news_count || 10} most recent news articles about: ${group.news_prompt}. 

For each article you find, return a JSON object with these exact fields:
- title: catchy headline (max 80 chars)
- url: complete source URL (REQUIRED - must be the actual article URL)
- published_date: YYYY-MM-DD format
- summary: compelling 60-word summary

IMPORTANT: Include the actual source URL from where you found each article. Return only a JSON array, no explanation.

Example format:
[{"title":"Article Title","url":"https://example.com/article","published_date":"2024-01-01","summary":"Article summary here..."}]`
                }
              ],
              temperature: 0.1,
              top_p: 0.9,
              max_tokens: 3000,
              return_images: false,
              return_related_questions: false,
              search_recency_filter: 'day',
              frequency_penalty: 1,
              presence_penalty: 0,
              search_domain_filter: ["reuters.com", "bloomberg.com", "techcrunch.com", "cnn.com", "bbc.com", "wsj.com", "ft.com", "nasdaq.com", "marketwatch.com"]
            })
          });

          clearTimeout(timeoutId);

          if (!perplexityResponse.ok) {
            const errorText = await perplexityResponse.text();
            console.error(`Perplexity API error for group ${group.name}:`, errorText);
            continue;
          }

          const perplexityData = await perplexityResponse.json();
          newsContent = perplexityData.choices?.[0]?.message?.content;

          if (!newsContent) {
            console.log(`No content returned for group ${group.name}`);
            continue;
          }

        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.error(`Timeout error for group ${group.name}`);
            continue;
          }
          throw fetchError;
        }

        // Parse JSON response and create individual posts
        let newsArticles;
        try {
          // Remove markdown code blocks if present
          let cleanContent = newsContent;
          if (newsContent.includes('```json')) {
            cleanContent = newsContent.replace(/```json\n?/g, '').replace(/```/g, '').trim();
          }
          newsArticles = JSON.parse(cleanContent);
        } catch (parseError) {
          console.error(`Failed to parse JSON for group ${group.name}:`, parseError);
          console.error(`Content was:`, newsContent);
          continue;
        }

        if (!Array.isArray(newsArticles)) {
          console.error(`Invalid response format for group ${group.name}`);
          continue;
        }

        // Create individual posts for each news article
        const postsToInsert = [];
        
        for (const article of newsArticles.slice(0, group.news_count || 10)) {
          // Generate thumbnail image if OpenAI key is available
          let thumbnailUrl = null;
          if (openAIApiKey) {
            thumbnailUrl = await generateThumbnailImage(article.title, openAIApiKey);
          }
          
          // Create clean post content without URL
          const postContent = `📰 **${article.title}**

${article.summary}

🤖 AI News Bot

📅 Published: ${new Date(article.published_date).toLocaleDateString()}`;

          postsToInsert.push({
            content: postContent,
            url: article.url || null, // Store URL separately for the clickable button
            group_id: group.id,
            user_id: group.created_by, // System posts by group creator
            image_url: thumbnailUrl
          });
        }

        const { error: postError } = await supabaseClient
          .from('posts')
          .insert(postsToInsert);

        if (postError) {
          console.error(`Error creating posts for group ${group.name}:`, postError);
          throw postError;
        }

        results.push({
          group: group.name,
          status: 'success',
          message: `Created ${postsToInsert.length} enhanced news posts successfully`
        });

        console.log(`Generated enhanced news for group: ${group.name}`);

      } catch (error) {
        console.error(`Error processing group ${group.name}:`, error);
        results.push({
          group: group.name,
          status: 'error',
          message: error.message
        });
      }
    }

    return new Response(JSON.stringify({ 
      message: 'Enhanced news generation completed', 
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-news function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
