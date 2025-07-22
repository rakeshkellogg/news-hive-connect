-- Update RLS policy to allow group creators to see all members of their groups
DROP POLICY IF EXISTS group_memberships_select_policy ON public.group_memberships;

CREATE POLICY group_memberships_select_policy
  ON public.group_memberships
  FOR SELECT
  TO authenticated
  USING (
    -- Allow users to see their own memberships
    auth.uid() = user_id
    -- OR allow group creator to see all memberships in their group
    OR (
      EXISTS (
        SELECT 1 FROM groups
        WHERE groups.id = group_memberships.group_id
        AND groups.created_by = auth.uid()
      )
    )
  );