-- Enhance super admin features: performance indexes and helper stats functions

-- Indexes for audit and profiles
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_action ON public.audit_logs(actor_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_action ON public.audit_logs(table_name, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended);

-- Helper: user statistics (uses audit_logs for active users in last 24h)
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS TABLE(
  total_users bigint,
  active_users_24h bigint,
  suspended_users bigint,
  super_admins bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (SELECT COUNT(*) FROM public.profiles) AS total_users,
    (SELECT COUNT(DISTINCT actor_id) FROM public.audit_logs WHERE created_at >= now() - interval '24 hours' AND actor_id IS NOT NULL) AS active_users_24h,
    (SELECT COUNT(*) FROM public.profiles WHERE is_suspended = true) AS suspended_users,
    (SELECT COUNT(*) FROM public.user_roles WHERE role = 'super_admin') AS super_admins;
$$;

-- Helper: platform statistics
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE(
  total_groups bigint,
  total_posts bigint,
  total_comments bigint,
  flagged_posts bigint,
  flagged_comments bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (SELECT COUNT(*) FROM public.groups) AS total_groups,
    (SELECT COUNT(*) FROM public.posts) AS total_posts,
    (SELECT COUNT(*) FROM public.comments) AS total_comments,
    (SELECT COUNT(*) FROM public.post_flags) AS flagged_posts,
    (SELECT COUNT(*) FROM public.comment_flags) AS flagged_comments;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_user_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO authenticated;