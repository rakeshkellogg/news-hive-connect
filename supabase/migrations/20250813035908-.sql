-- Fix security issue: Restrict profiles table SELECT access
-- Drop overly permissive policy if it exists
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Allow users to view: their own profile, profiles of members in the same groups, and super admins already have separate policies
CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm1
    JOIN public.group_memberships gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid()
      AND gm2.user_id = profiles.user_id
      AND gm1.user_id <> gm2.user_id
  )
);

-- Helpful index to support lookups by user_id
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);