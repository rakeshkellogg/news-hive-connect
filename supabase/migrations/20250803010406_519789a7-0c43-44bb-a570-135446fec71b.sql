-- Add keyword column to posts table to store Perplexity-generated keywords
ALTER TABLE public.posts 
ADD COLUMN keyword TEXT;