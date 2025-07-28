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

    // Get all groups with automated news enabled
    const { data: groups, error: groupsError } = await supabaseClient
      .from('groups')
      .select('*')
      .eq('automated_news_enabled', true);

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
      throw groupsError;
    }

    const results = [];

    for (const group of groups || []) {
      try {
        // Check if we should generate news based on frequency
        const { data: lastPost } = await supabaseClient
          .from('posts')
          .select('created_at')
          .eq('group_id', group.id)
          .eq('user_id', group.created_by) // System posts by group creator
          .order('created_at', { ascending: false })
          .limit(1);

        const shouldGenerate = lastPost?.[0] 
          ? new Date().getTime() - new Date(lastPost[0].created_at).getTime() >= (group.update_frequency * 24 * 60 * 60 * 1000)
          : true;

        if (!shouldGenerate) {
          console.log(`Skipping ${group.name} - too soon for next update`);
          continue;
        }

        // Generate news using Perplexity
        const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-large-128k-online',
            messages: [
              {
                role: 'system',
                content: 'You are a news curator. Provide concise, informative updates in a professional tone. Focus on recent developments and key insights.'
              },
              {
                role: 'user',
                content: `Generate a brief news update (2-3 paragraphs) about: ${group.news_prompt}. Focus on the most recent and significant developments.`
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

        if (!perplexityResponse.ok) {
          const errorText = await perplexityResponse.text();
          console.error(`Perplexity API error for group ${group.name}:`, errorText);
          continue;
        }

        const perplexityData = await perplexityResponse.json();
        const newsContent = perplexityData.choices?.[0]?.message?.content;

        if (!newsContent) {
          console.log(`No content returned for group ${group.name}`);
          continue;
        }

        // Create news post in the group
        const { error: postError } = await supabaseClient
          .from('posts')
          .insert({
            content: `📰 **Automated News Update**\n\n${newsContent}`,
            group_id: group.id,
            user_id: group.created_by // System posts by group creator
          });

        if (postError) {
          console.error(`Error creating post for group ${group.name}:`, postError);
          throw postError;
        }

        results.push({
          group: group.name,
          status: 'success',
          message: 'News post created successfully'
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