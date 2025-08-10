-- 1) Create roles enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('user', 'group_admin', 'super_admin');
  END IF;
END$$;

-- 2) Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Role-check function must exist BEFORE any policies use it
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  );
$$;

-- 4) Only super_admin can manage/view user_roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Super admins can select user_roles'
  ) THEN
    CREATE POLICY "Super admins can select user_roles"
    ON public.user_roles
    FOR SELECT
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Super admins can insert user_roles'
  ) THEN
    CREATE POLICY "Super admins can insert user_roles"
    ON public.user_roles
    FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Super admins can update user_roles'
  ) THEN
    CREATE POLICY "Super admins can update user_roles"
    ON public.user_roles
    FOR UPDATE
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Super admins can delete user_roles'
  ) THEN
    CREATE POLICY "Super admins can delete user_roles"
    ON public.user_roles
    FOR DELETE
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- 5) Seed super_admin for the provided email (if the user exists already)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = lower('rakesh.nw.kellogg@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- 6) Audit logs table (privacy-first: minimal fields, omit full row payloads)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id uuid NULL,
  old_data jsonb NULL,
  new_data jsonb NULL,
  metadata jsonb NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admins can read audit logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='Super admins can view audit logs'
  ) THEN
    CREATE POLICY "Super admins can view audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- 7) Audit trigger function (SECURITY DEFINER) - store minimal data by default
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := (SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, action, table_name, row_id, old_data, new_data, metadata)
    VALUES (v_actor, 'INSERT', TG_TABLE_NAME, NEW.id, NULL, NULL, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(actor_id, action, table_name, row_id, old_data, new_data, metadata)
    VALUES (v_actor, 'UPDATE', TG_TABLE_NAME, NEW.id, NULL, NULL, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(actor_id, action, table_name, row_id, old_data, new_data, metadata)
    VALUES (v_actor, 'DELETE', TG_TABLE_NAME, OLD.id, NULL, NULL, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 8) Attach audit triggers to core tables
DO $$
BEGIN
  -- posts
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_posts'
  ) THEN
    CREATE TRIGGER tr_audit_posts
    AFTER INSERT OR UPDATE OR DELETE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
  -- comments
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_comments'
  ) THEN
    CREATE TRIGGER tr_audit_comments
    AFTER INSERT OR UPDATE OR DELETE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
  -- groups
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_groups'
  ) THEN
    CREATE TRIGGER tr_audit_groups
    AFTER INSERT OR UPDATE OR DELETE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
  -- group_memberships
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_group_memberships'
  ) THEN
    CREATE TRIGGER tr_audit_group_memberships
    AFTER INSERT OR UPDATE OR DELETE ON public.group_memberships
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
  -- likes
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_likes'
  ) THEN
    CREATE TRIGGER tr_audit_likes
    AFTER INSERT OR UPDATE OR DELETE ON public.likes
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
  -- saved_prompts
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_saved_prompts'
  ) THEN
    CREATE TRIGGER tr_audit_saved_prompts
    AFTER INSERT OR UPDATE OR DELETE ON public.saved_prompts
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();
  END IF;
END$$;

-- 9) Super admin bypass policies for all core tables
-- Groups
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='groups' AND policyname='Super admins can select groups') THEN
    CREATE POLICY "Super admins can select groups" ON public.groups FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='groups' AND policyname='Super admins can insert groups') THEN
    CREATE POLICY "Super admins can insert groups" ON public.groups FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='groups' AND policyname='Super admins can update groups') THEN
    CREATE POLICY "Super admins can update groups" ON public.groups FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='groups' AND policyname='Super admins can delete groups') THEN
    CREATE POLICY "Super admins can delete groups" ON public.groups FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- Group memberships
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_memberships' AND policyname='Super admins can select memberships') THEN
    CREATE POLICY "Super admins can select memberships" ON public.group_memberships FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_memberships' AND policyname='Super admins can insert memberships') THEN
    CREATE POLICY "Super admins can insert memberships" ON public.group_memberships FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_memberships' AND policyname='Super admins can update memberships') THEN
    CREATE POLICY "Super admins can update memberships" ON public.group_memberships FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_memberships' AND policyname='Super admins can delete memberships') THEN
    CREATE POLICY "Super admins can delete memberships" ON public.group_memberships FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- Posts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='posts' AND policyname='Super admins can select posts') THEN
    CREATE POLICY "Super admins can select posts" ON public.posts FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='posts' AND policyname='Super admins can insert posts') THEN
    CREATE POLICY "Super admins can insert posts" ON public.posts FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='posts' AND policyname='Super admins can update posts') THEN
    CREATE POLICY "Super admins can update posts" ON public.posts FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='posts' AND policyname='Super admins can delete posts') THEN
    CREATE POLICY "Super admins can delete posts" ON public.posts FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- Comments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='Super admins can select comments') THEN
    CREATE POLICY "Super admins can select comments" ON public.comments FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='Super admins can insert comments') THEN
    CREATE POLICY "Super admins can insert comments" ON public.comments FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='Super admins can update comments') THEN
    CREATE POLICY "Super admins can update comments" ON public.comments FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='Super admins can delete comments') THEN
    CREATE POLICY "Super admins can delete comments" ON public.comments FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- Likes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='likes' AND policyname='Super admins can select likes') THEN
    CREATE POLICY "Super admins can select likes" ON public.likes FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='likes' AND policyname='Super admins can insert likes') THEN
    CREATE POLICY "Super admins can insert likes" ON public.likes FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='likes' AND policyname='Super admins can update likes') THEN
    CREATE POLICY "Super admins can update likes" ON public.likes FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='likes' AND policyname='Super admins can delete likes') THEN
    CREATE POLICY "Super admins can delete likes" ON public.likes FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- Saved prompts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_prompts' AND policyname='Super admins can select saved_prompts') THEN
    CREATE POLICY "Super admins can select saved_prompts" ON public.saved_prompts FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_prompts' AND policyname='Super admins can insert saved_prompts') THEN
    CREATE POLICY "Super admins can insert saved_prompts" ON public.saved_prompts FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_prompts' AND policyname='Super admins can update saved_prompts') THEN
    CREATE POLICY "Super admins can update saved_prompts" ON public.saved_prompts FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_prompts' AND policyname='Super admins can delete saved_prompts') THEN
    CREATE POLICY "Super admins can delete saved_prompts" ON public.saved_prompts FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- Profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Super admins can select profiles') THEN
    CREATE POLICY "Super admins can select profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Super admins can insert profiles') THEN
    CREATE POLICY "Super admins can insert profiles" ON public.profiles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Super admins can update profiles') THEN
    CREATE POLICY "Super admins can update profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Super admins can delete profiles') THEN
    CREATE POLICY "Super admins can delete profiles" ON public.profiles FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- Helpful index for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_row ON public.audit_logs(table_name, row_id);
