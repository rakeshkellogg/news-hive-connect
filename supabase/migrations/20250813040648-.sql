-- Secure groups table: restrict public SELECT and add invite join RPC

-- 1) Drop overly permissive SELECT policy that exposes all groups to any authenticated user
DROP POLICY IF EXISTS "groups_select_policy" ON public.groups;

-- 2) Allow only creators and members to view groups
CREATE POLICY "Group members and creators can view groups"
ON public.groups
FOR SELECT
USING (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()
  )
);

-- 3) RPC to join group by invite code without exposing group data
CREATE OR REPLACE FUNCTION public.join_group_by_invite_code(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_group_id
  FROM public.groups
  WHERE invite_code = p_invite_code;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- If already a member, return the group id
  IF EXISTS (
    SELECT 1 FROM public.group_memberships
    WHERE group_id = v_group_id AND user_id = auth.uid()
  ) THEN
    RETURN v_group_id;
  END IF;

  INSERT INTO public.group_memberships (group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'member');

  RETURN v_group_id;
END;
$$;

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON public.groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_user ON public.group_memberships(group_id, user_id);
