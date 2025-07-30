-- Add news_count column to groups table
ALTER TABLE public.groups 
ADD COLUMN news_count integer NOT NULL DEFAULT 10;

-- Add a check constraint to ensure reasonable values
ALTER TABLE public.groups 
ADD CONSTRAINT groups_news_count_check CHECK (news_count >= 1 AND news_count <= 20);