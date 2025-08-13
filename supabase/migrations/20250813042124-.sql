-- Break recursive RLS on groups <-> group_memberships and keep least-privilege access

-- 1) Helper functions using SECURITY DEFINER to avoid policy recursion
CREATE OR REPLACE FUNCTION public.is_member_of_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_creator_of_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = p_group_id AND g.created_by = auth.uid()
  );
$$;

-- 2) Replace recursive policies
DROP POLICY IF EXISTS "Group members and creators can view groups" ON public.groups;
CREATE POLICY "Group members and creators can view groups"
ON public.groups
FOR SELECT
USING (
  public.is_creator_of_group(id) OR public.is_member_of_group(id)
);

DROP POLICY IF EXISTS "group_memberships_select_policy" ON public.group_memberships;
CREATE POLICY "Group members can view their memberships or creators can view memberships of their groups"
ON public.group_memberships
FOR SELECT
USING (
  (auth.uid() = user_id) OR public.is_creator_of_group(group_id)
);

-- 3) Useful indexes for performance
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_user ON public.group_memberships(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);
