-- Add image_url column to posts table for news thumbnails
ALTER TABLE public.posts 
ADD COLUMN image_url TEXT;