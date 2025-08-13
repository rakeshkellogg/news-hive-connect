-- Secure invite codes by moving them to a separate table with strict RLS
-- 1) Create group_invites table
CREATE TABLE IF NOT EXISTS public.group_invites (
  group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'base64'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at
CREATE TRIGGER update_group_invites_updated_at
BEFORE UPDATE ON public.group_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Enable RLS and add least-privilege policies
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- Only group creators or super admins can view invite codes
DROP POLICY IF EXISTS "Creators or super admins can select group_invites" ON public.group_invites;
CREATE POLICY "Creators or super admins can select group_invites"
ON public.group_invites
FOR SELECT
USING (
  public.is_creator_of_group(group_id) OR public.has_role(auth.uid(), 'super_admin')
);

-- Only group creators or super admins can modify invite codes
DROP POLICY IF EXISTS "Creators or super admins can modify group_invites" ON public.group_invites;
CREATE POLICY "Creators or super admins can modify group_invites"
ON public.group_invites
FOR ALL
USING (
  public.is_creator_of_group(group_id) OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  public.is_creator_of_group(group_id) OR public.has_role(auth.uid(), 'super_admin')
);

-- 3) Migrate existing invite codes from groups
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'invite_code'
  ) THEN
    INSERT INTO public.group_invites (group_id, invite_code)
    SELECT id, invite_code FROM public.groups
    ON CONFLICT (group_id) DO UPDATE SET invite_code = EXCLUDED.invite_code;
  END IF;
END $$;

-- 4) Drop invite_code column from groups to prevent broad exposure
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'invite_code'
  ) THEN
    ALTER TABLE public.groups DROP COLUMN invite_code;
  END IF;
END $$;

-- 5) Update join_group_by_invite_code RPC to use group_invites
CREATE OR REPLACE FUNCTION public.join_group_by_invite_code(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT gi.group_id INTO v_group_id
  FROM public.group_invites gi
  WHERE gi.invite_code = p_invite_code;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- If already a member, return the group id
  IF EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = v_group_id AND gm.user_id = auth.uid()
  ) THEN
    RETURN v_group_id;
  END IF;

  INSERT INTO public.group_memberships (group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'member');

  RETURN v_group_id;
END;
$function$;

-- 6) Function to rotate invite codes (only creators/super admins)
CREATE OR REPLACE FUNCTION public.regenerate_group_invite(p_group_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_new_code text := encode(gen_random_bytes(8), 'base64');
BEGIN
  IF NOT public.is_creator_of_group(p_group_id) AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.group_invites
  SET invite_code = v_new_code
  WHERE group_id = p_group_id;

  IF NOT FOUND THEN
    INSERT INTO public.group_invites (group_id, invite_code) VALUES (p_group_id, v_new_code);
  END IF;

  RETURN v_new_code;
END;
$function$;

-- 7) Clean up any overly permissive profiles policies if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND polname = 'Profiles are viewable by everyone'
  ) THEN
    DROP POLICY "Profiles are viewable by everyone" ON public.profiles;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND polname = 'Users can view profiles'
  ) THEN
    DROP POLICY "Users can view profiles" ON public.profiles;
  END IF;
END $$;
