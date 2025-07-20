-- Drop old policies and function
DROP POLICY IF EXISTS "users_can_view_own_group_memberships" ON public.group_memberships;
DROP POLICY IF EXISTS "users_can_insert_group_memberships" ON public.group_memberships;
DROP POLICY IF EXISTS "users_can_update_group_memberships" ON public.group_memberships;
DROP POLICY IF EXISTS "users_can_delete_group_memberships" ON public.group_memberships;
DROP FUNCTION IF EXISTS public.user_can_access_group(UUID, UUID);

-- Create a security definer function to check group membership
CREATE OR REPLACE FUNCTION public.user_can_access_group(check_user_id UUID, check_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_member BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM group_memberships gm
        WHERE gm.user_id = check_user_id 
        AND gm.group_id = check_group_id
    ) INTO is_member;
    RETURN is_member;
END;
$$;

-- SELECT policy
CREATE POLICY "users_can_view_own_group_memberships"
ON public.group_memberships
FOR SELECT
TO authenticated
USING (
    public.user_can_access_group(auth.uid(), group_id)
);

-- INSERT policy (allow user to join a group if they are the user)
CREATE POLICY "users_can_insert_group_memberships"
ON public.group_memberships
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
);

-- UPDATE policy
CREATE POLICY "users_can_update_group_memberships"
ON public.group_memberships
FOR UPDATE
TO authenticated
USING (
    public.user_can_access_group(auth.uid(), group_id)
)
WITH CHECK (
    public.user_can_access_group(auth.uid(), group_id)
);

-- DELETE policy
CREATE POLICY "users_can_delete_group_memberships"
ON public.group_memberships
FOR DELETE
TO authenticated
USING (
    public.user_can_access_group(auth.uid(), group_id)
);