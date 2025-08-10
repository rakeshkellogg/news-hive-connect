-- Enable required extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Add a timestamp column to track last auto-generation per group
alter table public.groups
  add column if not exists last_news_run_at timestamptz;

-- Optional: index to help any future queries
create index if not exists idx_groups_last_news_run_at on public.groups(last_news_run_at);

-- Schedule the edge function to run hourly; it will self-gate per group based on update_frequency
-- Unschedule existing job with same name if present
do $$
begin
  if exists (select 1 from cron.job where jobname = 'invoke-generate-news-hourly') then
    perform cron.unschedule('invoke-generate-news-hourly');
  end if;
end $$;

select
  cron.schedule(
    'invoke-generate-news-hourly',
    '0 * * * *', -- every hour
    $$
    select
      net.http_post(
        url:='https://vmzzhwwpmguoymogrvcn.supabase.co/functions/v1/generate-news',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtenpod3dwbWd1b3ltb2dydmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMzU1MzcsImV4cCI6MjA2ODYxMTUzN30.ZXpaO6nqfpgzBpMGpO0_pPjwyGGyfJeHgD2sr3nEv1M"}'::jsonb,
        body:='{}'::jsonb
      ) as request_id;
    $$
  );