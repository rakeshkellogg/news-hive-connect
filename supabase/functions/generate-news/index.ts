
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getRelevantPhoto(title: string, pexelsApiKey: string, perplexityApiKey: string): Promise<{keyword: string, thumbnailUrl: string}> {
  try {
    // First, get a one-word visual keyword from Perplexity
    let keyword = 'news';
    
    console.log(`Processing title: "${title}"`);
    
    if (perplexityApiKey) {
      try {
        console.log('Extracting keyword with Perplexity...');
        const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [
              {
                role: 'user',
                content: `Generate ONE unique visual keyword for this news title that would work well for stock photo search. Avoid logos, brands, or specific people. Be creative and specific. Return only the keyword: "${title}"`
              }
            ],
            temperature: 0.7,
            max_tokens: 10
          }),
        });

        if (perplexityResponse.ok) {
          const perplexityData = await perplexityResponse.json();
          const extractedKeyword = perplexityData.choices?.[0]?.message?.content?.trim();
          if (extractedKeyword && extractedKeyword.length > 0) {
            keyword = extractedKeyword.replace(/[^\w]/g, '').toLowerCase();
            console.log(`Extracted keyword: "${keyword}"`);
          } else {
            console.log('No keyword extracted from Perplexity response');
          }
        } else {
          console.log('Perplexity API error:', await perplexityResponse.text());
        }
      } catch (perplexityError) {
        console.log('Perplexity keyword extraction failed:', perplexityError);
      }
    } else {
      console.log('No Perplexity API key available');
    }

    // Search Pexels with the keyword
    console.log(`Searching Pexels for keyword: "${keyword}"`);
    if (!pexelsApiKey) {
      console.log('No Pexels API key available, using fallback image');
      return { keyword, thumbnailUrl: generateFallbackImage() };
    }

    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=5&orientation=landscape`, {
      headers: {
        'Authorization': pexelsApiKey,
      },
    });

    if (!response.ok) {
      console.error('Pexels API error:', await response.text());
      return { keyword, thumbnailUrl: generateFallbackImage() };
    }

    const data = await response.json();
    const photos = data.photos;
    
    if (photos && photos.length > 0) {
      console.log(`Found ${photos.length} photos for keyword "${keyword}", using: ${photos[0].src.medium}`);
      return { keyword, thumbnailUrl: photos[0].src.medium };
    }
    
    // No photos found, return fallback
    console.log(`No photos found for keyword "${keyword}", using fallback`);
    return { keyword, thumbnailUrl: generateFallbackImage() };
  } catch (error) {
    console.error('Error fetching Pexels photo:', error);
    return { keyword: 'news', thumbnailUrl: generateFallbackImage() };
  }
}

function generateFallbackImage(): string {
  // Generate a simple SVG fallback image
  const svg = `
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="#374151"/>
      <text x="200" y="150" font-family="Arial, sans-serif" font-size="32" font-weight="bold" text-anchor="middle" fill="#ffffff">NewsBuzz</text>
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${btoa(svg)}`;
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
    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
    
    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    // Get the request body to check for specific group ID
    const body = await req.json().catch(() => ({} as any));
    const { groupId, isManualRequest } = body;


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
        console.log(`Processing group: ${group.name} (${group.id})`);
        console.log(`Group settings:`, {
          automated_news_enabled: group.automated_news_enabled,
          update_frequency: group.update_frequency,
          last_news_generation: group.last_news_generation,
          news_prompt: group.news_prompt,
          news_count: group.news_count
        });

        // Check frequency using last_news_generation (skip for manual requests)
        let shouldGenerate = true;
        if (!isManualRequest) {
          if (group.last_news_generation) {
            const lastGeneration = new Date(group.last_news_generation);
            const now = new Date();
            const daysSince = Math.floor((now.getTime() - lastGeneration.getTime()) / (1000 * 60 * 60 * 24));
            const required = group.update_frequency || 1;
            console.log(`Days since last generation for ${group.name}: ${daysSince}`);
            console.log(`Required frequency: ${required} days`);
            shouldGenerate = daysSince >= required;
          } else {
            console.log(`No previous generation for group ${group.name}, generating now`);
          }

          if (!shouldGenerate) {
            results.push({
              group: group.name,
              status: 'skipped',
              message: `Frequency not met (${group.update_frequency || 1} days)`
            });
            continue;
          }
        } else {
          console.log('Manual request detected; bypassing frequency check.');
        }


        // Rate limiting check per user/group
        const actorUserId = (body && body.userId) ? body.userId : group.created_by;
        const { data: rateLimitData, error: rateLimitError } = await supabaseClient
          .rpc('can_generate_news', {
            p_group_id: group.id,
            p_user_id: actorUserId,
          });

        if (rateLimitError) {
          console.error('Rate limit check error:', rateLimitError);
          results.push({ group: group.name, status: 'error', message: 'Rate limit check failed' });
          continue;
        }

        if (!(rateLimitData && rateLimitData[0]?.can_generate)) {
          const message = rateLimitData?.[0]?.message || 'Daily limit reached';
          console.log(`Rate limit exceeded for group ${group.name}: ${message}`);
          await supabaseClient.rpc('log_news_generation', {
            p_group_id: group.id,
            p_user_id: actorUserId,
            p_status: 'rate_limited',
            p_error_message: message,
          });
          results.push({ group: group.name, status: 'rate_limited', message });
          continue;
        }

        console.log(`Rate limit check passed for group ${group.name}. Remaining: ${rateLimitData[0].remaining_count}`);

        // Update status to running
        await supabaseClient
          .from('groups')
          .update({ news_generation_status: 'running' })
          .eq('id', group.id);

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
                  content: `You are a professional news curator that MUST return valid JSON only. 

CRITICAL JSON FORMATTING RULES:
1. Use ONLY standard double quotes (") - never use smart quotes (" " ' ')
2. Always escape internal quotes with backslash (\")
3. No trailing commas anywhere
4. All property names must be in double quotes
5. Return ONLY the JSON array - no markdown, no explanations, no code blocks
6. Ensure all URLs are complete and valid`
                },
                {
                  role: 'user',
                  content: `Find the ${group.news_count || 10} most recent news articles about: ${group.news_prompt}

CRITICAL FILTERING REQUIREMENTS:
- ONLY articles published within the last 48 hours (last 2 days)
- ONLY articles with unique titles (no duplicates)
- Verify publication dates are within 48 hours of current time

REQUIRED OUTPUT FORMAT - Return ONLY this exact JSON structure:
[
  {
    "title": "Article Title Here",
    "url": "https://complete-source-url.com/article-path",
    "published_date": "2025-01-01",
    "summary": "Compelling 60-word summary without quotes or special characters",
    "keyword": "singleword"
  }
]

STRICT REQUIREMENTS:
- title: Maximum 80 characters, no quotes inside, must be unique
- url: Complete source URL (REQUIRED - must be actual article URL)  
- published_date: YYYY-MM-DD format only, MUST be within last 48 hours
- summary: Exactly 60 words, replace all quotes with apostrophes
- keyword: Single word for image search (no logos, brands, people names)

CRITICAL: Use only standard ASCII quotes. Replace any smart quotes, em-dashes, or special characters with standard ones. Return ONLY the JSON array. EXCLUDE any articles older than 48 hours or with duplicate titles.`
                }
              ],
              temperature: 0.1,
              top_p: 0.9,
              max_tokens: 3000,
              return_images: false,
              return_related_questions: false,
              search_recency_filter: 'day', // Perplexity day filter + 48hr validation
              frequency_penalty: 1,
              presence_penalty: 0,
              search_domain_filter: group.news_sources && group.news_sources.length > 0 
                ? group.news_sources 
                : ["reuters.com", "bloomberg.com", "techcrunch.com", "cnn.com", "bbc.com", "wsj.com", "ft.com", "nasdaq.com", "marketwatch.com"]
            })
          });

          clearTimeout(timeoutId);

          if (!perplexityResponse.ok) {
            const errorText = await perplexityResponse.text();
            console.error(`Perplexity API error for group ${group.name}:`, errorText);
            console.error(`Response status: ${perplexityResponse.status}`);
            console.error(`Response headers:`, Object.fromEntries(perplexityResponse.headers.entries()));
            
            // Add more specific error handling
            if (perplexityResponse.status === 429) {
              console.error('Rate limit exceeded for Perplexity API');
              await supabaseClient
                .from('groups')
                .update({ news_generation_status: 'failed', last_generation_error: 'Rate limit exceeded. Please try again later.' })
                .eq('id', group.id);
              results.push({
                group: group.name,
                status: 'error',
                message: 'Rate limit exceeded. Please try again later.'
              });
              continue;
            } else if (perplexityResponse.status === 503) {
              console.error('Perplexity API service unavailable');
              await supabaseClient
                .from('groups')
                .update({ news_generation_status: 'failed', last_generation_error: 'API service temporarily unavailable.' })
                .eq('id', group.id);
              results.push({
                group: group.name,
                status: 'error',
                message: 'API service temporarily unavailable.'
              });
              continue;
            }
            
            await supabaseClient
              .from('groups')
              .update({ news_generation_status: 'failed', last_generation_error: `API error: ${perplexityResponse.status}` })
              .eq('id', group.id);
            results.push({
              group: group.name,
              status: 'error',
              message: `API error: ${perplexityResponse.status}`
            });
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
          if ((fetchError as any).name === 'AbortError') {
            console.error(`Timeout error for group ${group.name}`);
            await supabaseClient
              .from('groups')
              .update({ news_generation_status: 'failed', last_generation_error: 'Request timed out' })
              .eq('id', group.id);
            results.push({
              group: group.name,
              status: 'error',
              message: 'Request timed out'
            });
            continue;
          }
          await supabaseClient
            .from('groups')
            .update({ news_generation_status: 'failed', last_generation_error: (fetchError as any).message || 'Network error' })
            .eq('id', group.id);
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
          
          // Enhanced JSON cleaning - handle all types of malformed JSON
          cleanContent = cleanContent
            .replace(/[""]/g, '"')  // Replace smart quotes with regular quotes
            .replace(/['']/g, "'")  // Replace smart apostrophes
            .replace(/[\u201C\u201D]/g, '"')  // Unicode left/right double quotes
            .replace(/[\u2018\u2019]/g, "'")  // Unicode left/right single quotes
            .replace(/\u2013/g, '-')  // En dash
            .replace(/\u2014/g, '--')  // Em dash
            .replace(/\u00A0/g, ' ')  // Non-breaking space
            .replace(/\t/g, ' ')  // Replace tabs with spaces
            .replace(/\n\s*\n/g, '\n')  // Remove double newlines
            .trim();

          // Additional JSON structure fixes
          cleanContent = cleanContent
            .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
            .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Quote unquoted property names
            .replace(/:\s*'([^']*)'/g, ': "$1"')  // Replace single quotes with double quotes for values
            .replace(/\\'/g, "'")  // Fix escaped single quotes
            .replace(/\\"/g, '"')  // Fix double escaped quotes
            .replace(/"\s*\+\s*"/g, '')  // Remove string concatenation
            .replace(/,\s*}/g, '}')  // Remove trailing commas before closing braces
            .replace(/,\s*]/g, ']');  // Remove trailing commas before closing brackets
            
          console.log('Cleaned content before parsing:', cleanContent);
          newsArticles = JSON.parse(cleanContent);
        } catch (parseError) {
          console.error(`Failed to parse JSON for group ${group.name}:`, parseError);
          console.error(`Content was:`, newsContent);
          
          // Try to extract JSON array from the content if it's embedded in text
          const jsonMatch = newsContent.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              let extractedJson = jsonMatch[0]
                .replace(/[""]/g, '"')
                .replace(/['']/g, "'")
                .replace(/,(\s*[}\]])/g, '$1')
                .replace(/:\s*"([^"]*)"([^,}\]]*)/g, (match, p1, p2) => {
                  // Fix broken quotes in the middle of strings
                  return `: "${p1}${p2.replace(/"/g, '\\"')}"`;
                });
              
              newsArticles = JSON.parse(extractedJson);
              console.log('Successfully parsed JSON from extracted content');
            } catch (secondParseError) {
              console.error('Failed to parse extracted JSON:', secondParseError);
              continue;
            }
          } else {
            continue;
          }
        }

        if (!Array.isArray(newsArticles)) {
          console.error(`Invalid response format for group ${group.name}`);
          continue;
        }

        // Filter articles: 48-hour check + duplicate detection against existing posts
        const now = new Date();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        
        // Get existing post titles from last 7 days for duplicate detection
        const { data: existingPosts } = await supabaseClient
          .from('posts')
          .select('content')
          .eq('group_id', group.id)
          .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
        
        const existingTitles = new Set();
        if (existingPosts) {
          existingPosts.forEach(post => {
            const titleMatch = post.content.match(/📰 \*\*(.*?)\*\*/);
            if (titleMatch) {
              existingTitles.add(titleMatch[1].toLowerCase().trim());
            }
          });
        }

        // Filter and validate articles
        const validArticles = newsArticles.filter(article => {
          // Check if title exists and is not duplicate
          if (!article.title || existingTitles.has(article.title.toLowerCase().trim())) {
            console.log(`Skipping duplicate article: ${article.title}`);
            return false;
          }
          
          // Validate 48-hour requirement
          if (article.published_date) {
            const publishedDate = new Date(article.published_date);
            if (publishedDate < fortyEightHoursAgo) {
              console.log(`Skipping old article (${article.published_date}): ${article.title}`);
              return false;
            }
          }
          
          // Validate required fields
          return article.title && article.summary && article.url;
        });

        console.log(`Filtered ${newsArticles.length} articles to ${validArticles.length} valid articles within 48 hours`);

        if (validArticles.length === 0) {
          console.log(`No valid articles found for group ${group.name} within the last 48 hours`);
          results.push({
            group: group.name,
            status: 'success',
            message: 'No new articles found within the last 48 hours'
          });
          
          // Update status but don't log as failure since this is expected behavior
          await supabaseClient
            .from('groups')
            .update({ 
              last_news_generation: new Date().toISOString(),
              news_generation_status: 'completed',
              last_generation_error: null
            })
            .eq('id', group.id);
          continue;
        }

        // Create individual posts for each valid news article
        const postsToInsert = await Promise.all(validArticles.slice(0, group.news_count || 10).map(async (article) => {
          // Get image from Pexels using the keyword from Perplexity
          let thumbnailUrl = null;
          const keyword = article.keyword || 'news';
          
          if (pexelsApiKey && keyword) {
            try {
              console.log(`Searching Pexels for keyword: "${keyword}"`);
              const pexelsResponse = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=1&orientation=landscape`, {
                headers: {
                  'Authorization': pexelsApiKey
                }
              });
              
              if (pexelsResponse.ok) {
                const pexelsData = await pexelsResponse.json();
                if (pexelsData.photos && pexelsData.photos.length > 0) {
                  thumbnailUrl = pexelsData.photos[0].src.medium;
                  console.log(`Found image for keyword "${keyword}": ${thumbnailUrl}`);
                } else {
                  console.log(`No photos found for keyword "${keyword}"`);
                }
              } else {
                console.error(`Pexels API error for keyword "${keyword}":`, await pexelsResponse.text());
              }
            } catch (error) {
              console.error(`Error fetching image for keyword "${keyword}":`, error);
            }
          }
          
          // Use fallback image if no Pexels image found
          if (!thumbnailUrl) {
            thumbnailUrl = generateFallbackImage();
          }
          
          // Create clean post content without URL
          const postContent = `📰 **${article.title}**

${article.summary}

🤖 AI News Bot

📅 Published: ${new Date(article.published_date).toLocaleDateString()}`;

          return {
            content: postContent,
            url: article.url || null, // Store URL separately for the clickable button
            group_id: group.id,
            user_id: group.created_by, // System posts by group creator
            image_url: thumbnailUrl,
            keyword: keyword
          };
        }));

        const { error: postError } = await supabaseClient
          .from('posts')
          .insert(postsToInsert);

        if (postError) {
          console.error(`Error creating posts for group ${group.name}:`, postError);
          throw postError;
        }

        // Update last generation timestamp and status
        const { error: updateGroupError } = await supabaseClient
          .from('groups')
          .update({ 
            last_news_generation: new Date().toISOString(),
            news_generation_status: 'completed',
            last_generation_error: null
          })
          .eq('id', group.id);

        if (updateGroupError) {
          console.error('Failed to update generation status for group', group.id, updateGroupError);
        }

        // Log successful generation
        await supabaseClient.rpc('log_news_generation', {
          p_group_id: group.id,
          p_user_id: actorUserId,
          p_status: 'success',
        });

        results.push({
          group: group.name,
          status: 'success',
          message: `Created ${postsToInsert.length} enhanced news posts successfully`
        });

        console.log(`Generated enhanced news for group: ${group.name}`);

        } catch (error) {
          console.error(`Error processing group ${group.name}:`, error);
          try {
            const actorUserId = (body && body.userId) ? body.userId : group.created_by;
            await supabaseClient.rpc('log_news_generation', {
              p_group_id: group.id,
              p_user_id: actorUserId,
              p_status: 'failed',
              p_error_message: (error as any).message || 'Unknown error',
            });
          } catch (logErr) {
            console.error('Failed to log news generation failure:', logErr);
          }
          await supabaseClient
            .from('groups')
            .update({ news_generation_status: 'failed', last_generation_error: (error as any).message || 'Unknown error' })
            .eq('id', group.id);
          results.push({
            group: group.name,
            status: 'error',
            message: (error as any).message || 'Unknown error'
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
