-- Add foreign key relationship between group_memberships and profiles
ALTER TABLE public.group_memberships 
ADD CONSTRAINT fk_group_memberships_user_id 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;