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

    console.log('Starting scheduled news generation...');

    // Get all groups with automated news enabled, oldest generation first
    const { data: groups, error: groupsError } = await supabaseClient
      .from('groups')
      .select('*')
      .eq('automated_news_enabled', true)
      .order('last_news_generation', { ascending: true, nullsFirst: true });

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
      throw groupsError;
    }

    if (!groups || groups.length === 0) {
      console.log('No groups with automated news enabled found');
      return new Response(JSON.stringify({ 
        message: 'No groups with automated news enabled', 
        results: [] 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];
    const today = new Date();

    for (const group of groups) {
      try {
        console.log(`Checking group: ${group.name} (${group.id})`);
        console.log(`Frequency: ${group.update_frequency} days, Last generation: ${group.last_news_generation}`);

        // Check if news should be generated based on frequency
        const shouldGenerate = await (async () => {
          if (!group.last_news_generation) return true;
          const lastGeneration = new Date(group.last_news_generation);
          const daysSince = Math.floor((today.getTime() - lastGeneration.getTime()) / (1000 * 60 * 60 * 24));
          const required = group.update_frequency || 1;
          console.log(`Days since last generation for ${group.name}: ${daysSince}`);
          return daysSince >= required;
        })();
        
        if (!shouldGenerate) {
          console.log(`Skipping group ${group.name} - frequency not met`);
          results.push({
            group: group.name,
            status: 'skipped',
            message: `Frequency not met (${group.update_frequency || 1} days)`
          });
          continue;
        }

        // Call the generate-news function for this specific group
        const { data: generationResult, error: generationError } = await supabaseClient.functions.invoke('generate-news', {
          body: { groupId: group.id }
        });

        if (generationError) {
          console.error(`Error generating news for group ${group.name}:`, generationError);
          results.push({
            group: group.name,
            status: 'error',
            message: generationError.message
          });
          continue;
        }

        console.log(`News generation result for ${group.name}:`, generationResult);
        results.push({
          group: group.name,
          status: 'success',
          message: generationResult?.results?.[0]?.message || 'News generated'
        });
      } catch (groupError) {
        console.error(`Error processing group ${group.name}:`, groupError);
        results.push({
          group: group.name,
          status: 'error',
          message: (groupError as any).message || 'Unknown error'
        });
      }
    }

    console.log('Scheduled news generation completed:', results);
    return new Response(JSON.stringify({ 
      message: 'Scheduled news generation completed', 
      results,
      timestamp: today.toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in scheduled news generation:', error);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
