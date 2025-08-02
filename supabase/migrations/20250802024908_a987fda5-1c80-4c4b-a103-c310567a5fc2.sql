-- Add URL column to posts table for storing article links separately
ALTER TABLE public.posts ADD COLUMN url TEXT;