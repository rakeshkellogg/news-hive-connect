-- Enable required extensions for scheduling and HTTP requests
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- Unschedule existing job if already present (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoke-scheduled-news-hourly') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'invoke-scheduled-news-hourly';
  END IF;
END
$$;

-- Schedule the "scheduled-news" function to run hourly
select
  cron.schedule(
    'invoke-scheduled-news-hourly',
    '0 * * * *', -- every hour at minute 0
    $$
    select
      net.http_post(
          url:='https://vmzzhwwpmguoymogrvcn.supabase.co/functions/v1/scheduled-news',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtenpod3dwbWd1b3ltb2dydmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMzU1MzcsImV4cCI6MjA2ODYxMTUzN30.ZXpaO6nqfpgzBpMGpO0_pPjwyGGyfJeHgD2sr3nEv1M"}'::jsonb,
          body:=jsonb_build_object('source', 'cron', 'requested_at', now())
      ) as request_id;
    $$
  );