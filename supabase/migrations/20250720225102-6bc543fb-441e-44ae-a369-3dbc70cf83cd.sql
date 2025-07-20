-- Drop the old "Users can join groups" policy (for public role)
DROP POLICY IF EXISTS "Users can join groups" ON public.group_memberships;

-- The "users_can_insert_group_memberships" policy for authenticated users will remain