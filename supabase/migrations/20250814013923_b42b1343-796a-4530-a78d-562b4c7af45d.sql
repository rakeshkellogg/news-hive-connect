-- Add news_sources column to groups table
ALTER TABLE public.groups 
ADD COLUMN news_sources TEXT[] DEFAULT '{"perplexity.ai"}';

-- Add comment for documentation
COMMENT ON COLUMN public.groups.news_sources IS 'Array of domain names that Perplexity will use as preferred sources for news generation';