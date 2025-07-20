-- Clean up duplicate policies on group_memberships table
DROP POLICY IF EXISTS "Users can join groups" ON public.group_memberships;
DROP POLICY IF EXISTS "users_can_insert_group_memberships" ON public.group_memberships;

-- Create a single, clear INSERT policy
CREATE POLICY "Users can insert their own memberships"
ON public.group_memberships
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);