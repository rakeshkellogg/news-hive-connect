import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
        // For manual generation (via API call), always generate
        // For automated scheduled generation, check frequency
        // Since this function can be called both manually and on schedule,
        // we'll always generate for now (frequency checking can be added to a scheduler)

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
              model: 'sonar',
              messages: [
                {
                  role: 'system',
                  content: 'You are a news curator. Provide concise, informative updates in a professional tone. Focus on recent developments and key insights.'
                },
                {
                  role: 'user',
                  content: `Find the ${group.news_count || 10} most recent news articles about: ${group.news_prompt}. For each article, return a JSON object with:
- title
- url (if available)
- published_date (YYYY-MM-DD)
- summary (maximum 30 words)

Return a JSON array of these objects only, without explanation.`
                }
              ],
              temperature: 0.2,
              top_p: 0.9,
              max_tokens: 2000,
              return_images: false,
              return_related_questions: false,
              search_recency_filter: 'day',
              frequency_penalty: 1,
              presence_penalty: 0
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
        const postsToInsert = newsArticles.slice(0, group.news_count || 10).map(article => ({
          content: `📰 **${article.title}**\n\n${article.summary}\n\n📅 Published: ${article.published_date}${article.url ? `\n🔗 [Read more](${article.url})` : ''}`,
          group_id: group.id,
          user_id: group.created_by // System posts by group creator
        }));

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
          message: `Created ${postsToInsert.length} news posts successfully`
        });

        console.log(`Generated news for group: ${group.name}`);

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
      message: 'News generation completed', 
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