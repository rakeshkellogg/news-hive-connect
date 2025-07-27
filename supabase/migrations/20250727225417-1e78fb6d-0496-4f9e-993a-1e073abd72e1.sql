-- Add automated news fields to groups table
ALTER TABLE public.groups 
ADD COLUMN automated_news_enabled boolean DEFAULT false,
ADD COLUMN news_prompt text,
ADD COLUMN update_frequency integer DEFAULT 1 CHECK (update_frequency IN (1, 2, 3));