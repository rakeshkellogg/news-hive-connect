-- Check current policies on groups table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'groups';

-- Drop and recreate the INSERT policy with proper syntax
DROP POLICY IF EXISTS "Users can create groups" ON public.groups;

-- Create a new INSERT policy that should work
CREATE POLICY "Users can create groups"
ON public.groups
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);