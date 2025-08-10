-- Migration: Add frequency/status checks and index for automated news
-- Safely add CHECK constraints and index without duplications

-- Ensure update_frequency only allows supported values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_update_frequency_check'
  ) THEN
    ALTER TABLE public.groups
    ADD CONSTRAINT groups_update_frequency_check
    CHECK (update_frequency IN (1, 2, 3, 7, 14, 30));
  END IF;
END
$$;

-- Ensure news_generation_status only allows valid states
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_news_generation_status_check'
  ) THEN
    ALTER TABLE public.groups
    ADD CONSTRAINT groups_news_generation_status_check
    CHECK (news_generation_status IN ('idle', 'running', 'failed', 'completed'));
  END IF;
END
$$;

-- Index to speed up querying groups due for generation
CREATE INDEX IF NOT EXISTS idx_groups_automated_news_frequency
ON public.groups(automated_news_enabled, update_frequency, last_news_generation)
WHERE automated_news_enabled = true;