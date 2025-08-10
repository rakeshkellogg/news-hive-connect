-- Phase 1: Super Admin improvements aligned with existing role system (user_roles + has_role)
-- 1) Moderation: create dedicated flag tables to avoid weakening RLS on posts/comments

-- post_flags table
CREATE TABLE IF NOT EXISTS public.post_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_flags ENABLE ROW LEVEL SECURITY;

-- helpful indexes
CREATE INDEX IF NOT EXISTS idx_post_flags_post_id ON public.post_flags(post_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_post_flags_post_user ON public.post_flags(post_id, user_id);

-- RLS: super admin full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_flags' AND policyname='Super admins can select post_flags'
  ) THEN
    CREATE POLICY "Super admins can select post_flags"
    ON public.post_flags
    FOR SELECT
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_flags' AND policyname='Super admins can insert post_flags'
  ) THEN
    CREATE POLICY "Super admins can insert post_flags"
    ON public.post_flags
    FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_flags' AND policyname='Super admins can update post_flags'
  ) THEN
    CREATE POLICY "Super admins can update post_flags"
    ON public.post_flags
    FOR UPDATE
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_flags' AND policyname='Super admins can delete post_flags'
  ) THEN
    CREATE POLICY "Super admins can delete post_flags"
    ON public.post_flags
    FOR DELETE
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- RLS: group members can insert/select flags on posts within groups they belong to; users can delete their own flags
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_flags' AND policyname='Group members can insert post_flags'
  ) THEN
    CREATE POLICY "Group members can insert post_flags"
    ON public.post_flags
    FOR INSERT
    WITH CHECK (
      auth.uid() = user_id AND EXISTS (
        SELECT 1
        FROM public.posts p
        JOIN public.group_memberships gm ON gm.group_id = p.group_id
        WHERE p.id = post_id AND gm.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_flags' AND policyname='Group members can view post_flags'
  ) THEN
    CREATE POLICY "Group members can view post_flags"
    ON public.post_flags
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.posts p
        JOIN public.group_memberships gm ON gm.group_id = p.group_id
        WHERE p.id = post_flags.post_id AND gm.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='post_flags' AND policyname='Users can delete their own post_flags'
  ) THEN
    CREATE POLICY "Users can delete their own post_flags"
    ON public.post_flags
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END$$;

-- comment_flags table
CREATE TABLE IF NOT EXISTS public.comment_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comment_flags ENABLE ROW LEVEL SECURITY;

-- helpful indexes
CREATE INDEX IF NOT EXISTS idx_comment_flags_comment_id ON public.comment_flags(comment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_comment_flags_comment_user ON public.comment_flags(comment_id, user_id);

-- RLS: super admin full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_flags' AND policyname='Super admins can select comment_flags'
  ) THEN
    CREATE POLICY "Super admins can select comment_flags"
    ON public.comment_flags
    FOR SELECT
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_flags' AND policyname='Super admins can insert comment_flags'
  ) THEN
    CREATE POLICY "Super admins can insert comment_flags"
    ON public.comment_flags
    FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_flags' AND policyname='Super admins can update comment_flags'
  ) THEN
    CREATE POLICY "Super admins can update comment_flags"
    ON public.comment_flags
    FOR UPDATE
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_flags' AND policyname='Super admins can delete comment_flags'
  ) THEN
    CREATE POLICY "Super admins can delete comment_flags"
    ON public.comment_flags
    FOR DELETE
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- RLS: group members can insert/select flags on comments within groups they belong to; users can delete their own flags
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_flags' AND policyname='Group members can insert comment_flags'
  ) THEN
    CREATE POLICY "Group members can insert comment_flags"
    ON public.comment_flags
    FOR INSERT
    WITH CHECK (
      auth.uid() = user_id AND EXISTS (
        SELECT 1
        FROM public.comments c
        JOIN public.posts p ON p.id = c.post_id
        JOIN public.group_memberships gm ON gm.group_id = p.group_id
        WHERE c.id = comment_id AND gm.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_flags' AND policyname='Group members can view comment_flags'
  ) THEN
    CREATE POLICY "Group members can view comment_flags"
    ON public.comment_flags
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.comments c
        JOIN public.posts p ON p.id = c.post_id
        JOIN public.group_memberships gm ON gm.group_id = p.group_id
        WHERE c.id = comment_flags.comment_id AND gm.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_flags' AND policyname='Users can delete their own comment_flags'
  ) THEN
    CREATE POLICY "Users can delete their own comment_flags"
    ON public.comment_flags
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END$$;

-- 2) Suspension fields on profiles with protection via trigger (only super_admin can modify)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;

-- Prevent non-super-admins from changing suspension fields
CREATE OR REPLACE FUNCTION public.profiles_protect_suspension_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    IF (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason)
       OR (NEW.suspended_until IS DISTINCT FROM OLD.suspended_until)
       OR (NEW.suspended_by IS DISTINCT FROM OLD.suspended_by) THEN
      RAISE EXCEPTION 'Only super admins can modify suspension fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_profiles_protect_suspension_fields'
  ) THEN
    CREATE TRIGGER tr_profiles_protect_suspension_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_suspension_fields();
  END IF;
END$$;

-- 3) Audit triggers for new flag tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_post_flags'
  ) THEN
    CREATE TRIGGER tr_audit_post_flags
    AFTER INSERT OR UPDATE OR DELETE ON public.post_flags
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_comment_flags'
  ) THEN
    CREATE TRIGGER tr_audit_comment_flags
    AFTER INSERT OR UPDATE OR DELETE ON public.comment_flags
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
END$$;