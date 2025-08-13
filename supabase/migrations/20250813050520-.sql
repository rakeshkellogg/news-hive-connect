-- 20250813060000_add_daily_news_limit.sql
-- Add daily_news_limit column to groups table
ALTER TABLE public.groups 
ADD COLUMN IF NOT EXISTS daily_news_limit INTEGER NOT NULL DEFAULT 10 CHECK (daily_news_limit >= 1 AND daily_news_limit <= 100);

-- Add index for performance (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_groups_daily_news_limit' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_groups_daily_news_limit ON public.groups(daily_news_limit);
  END IF;
END $$;

COMMENT ON COLUMN public.groups.daily_news_limit IS 'Maximum number of news generations allowed per 24 hours for this group';

-- 20250813060001_create_news_generation_logs.sql
-- Create table to track news generation attempts
CREATE TABLE IF NOT EXISTS public.news_generation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rate_limited')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_news_generation_logs_group_user' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_news_generation_logs_group_user ON public.news_generation_logs(group_id, user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_news_generation_logs_generated_at' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_news_generation_logs_generated_at ON public.news_generation_logs(generated_at);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_news_generation_logs_status' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_news_generation_logs_status ON public.news_generation_logs(status);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.news_generation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for news_generation_logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news_generation_logs' AND policyname = 'Group members can view generation logs'
  ) THEN
    CREATE POLICY "Group members can view generation logs" 
    ON public.news_generation_logs 
    FOR SELECT 
    USING (
      auth.uid() IN (
        SELECT user_id FROM public.group_memberships 
        WHERE group_id = public.news_generation_logs.group_id
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news_generation_logs' AND policyname = 'Users can insert their own generation logs'
  ) THEN
    CREATE POLICY "Users can insert their own generation logs" 
    ON public.news_generation_logs 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news_generation_logs' AND policyname = 'Super admins can manage all generation logs'
  ) THEN
    CREATE POLICY "Super admins can manage all generation logs" 
    ON public.news_generation_logs 
    FOR ALL 
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- Add audit trigger (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_news_generation_logs'
  ) THEN
    CREATE TRIGGER audit_news_generation_logs
      AFTER INSERT OR UPDATE OR DELETE ON public.news_generation_logs
      FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
END $$;

COMMENT ON TABLE public.news_generation_logs IS 'Tracks news generation attempts for rate limiting';

-- 20250813060002_add_rate_limit_functions.sql
-- Function to check if user can generate news (rate limiting)
CREATE OR REPLACE FUNCTION public.can_generate_news(p_group_id uuid, p_user_id uuid)
RETURNS TABLE(can_generate boolean, remaining_count integer, limit_count integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit_count integer;
  v_used_count integer;
  v_remaining_count integer;
  v_can_generate boolean;
  v_message text;
BEGIN
  -- Get the daily limit for this group
  SELECT daily_news_limit INTO v_limit_count
  FROM public.groups
  WHERE id = p_group_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, 'Group not found'::text;
    RETURN;
  END IF;
  
  -- Count successful generations in the last 24 hours
  SELECT COUNT(*) INTO v_used_count
  FROM public.news_generation_logs
  WHERE group_id = p_group_id 
    AND user_id = p_user_id 
    AND status = 'success'
    AND generated_at >= now() - interval '24 hours';
  
  v_remaining_count := GREATEST(0, v_limit_count - v_used_count);
  v_can_generate := v_remaining_count > 0;
  
  IF v_can_generate THEN
    v_message := format('Can generate %s more news posts today', v_remaining_count);
  ELSE
    v_message := format('Daily limit of %s reached. Try again tomorrow.', v_limit_count);
  END IF;
  
  RETURN QUERY SELECT v_can_generate, v_remaining_count, v_limit_count, v_message;
END;
$$;

-- Function to log news generation attempt
CREATE OR REPLACE FUNCTION public.log_news_generation(p_group_id uuid, p_user_id uuid, p_status text, p_error_message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.news_generation_logs (group_id, user_id, status, error_message)
  VALUES (p_group_id, p_user_id, p_status, p_error_message)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.can_generate_news(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_news_generation(uuid, uuid, text, text) TO authenticated;