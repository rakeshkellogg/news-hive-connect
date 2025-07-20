-- First, drop any existing conflicting policies and function
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
SET search_path = ''
AS $$
DECLARE
    is_member BOOLEAN;
BEGIN
    -- Check if the user is a member of the group
    SELECT EXISTS (
        SELECT 1 
        FROM public.group_memberships gm
        WHERE gm.user_id = check_user_id 
        AND gm.group_id = check_group_id
    ) INTO is_member;
    
    RETURN is_member;
END;
$$;

-- Create RLS policies using the security definer function
-- SELECT policy
CREATE POLICY "users_can_view_own_group_memberships"
ON public.group_memberships
FOR SELECT
TO authenticated
USING (
    public.user_can_access_group(auth.uid(), group_id)
);

-- INSERT policy
CREATE POLICY "users_can_insert_group_memberships"
ON public.group_memberships
FOR INSERT
TO authenticated
WITH CHECK (
    public.user_can_access_group(auth.uid(), group_id)
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