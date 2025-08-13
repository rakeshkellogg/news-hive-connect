-- Harden profiles exposure: remove group-wide SELECT and rely on RPC for public fields

-- 1) Drop policy that allows group members to select full profiles (contains sensitive columns like email)
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- 2) Ensure self-view and super admin policies remain (already exist in schema)
--    - "Users can view their own profile" (SELECT USING (auth.uid() = user_id))
--    - "Super admins can view profiles" (SELECT USING (public.has_role(auth.uid(), 'super_admin')))

-- 3) Keep/get_public_profiles RPC for safe lookups of non-sensitive fields
--    Function already exists:
--    CREATE OR REPLACE FUNCTION public.get_public_profiles(ids uuid[])
--    RETURNS TABLE(user_id uuid, username text)
--    ... SECURITY DEFINER ...

-- 4) Optional: Supporting index (already likely present); create if missing
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
