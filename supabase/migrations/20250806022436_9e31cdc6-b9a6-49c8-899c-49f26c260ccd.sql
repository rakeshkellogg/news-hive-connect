-- Create a table for storing saved news prompts for groups
CREATE TABLE public.saved_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY;

-- Create policies for saved prompts
CREATE POLICY "Group admins can view saved prompts" 
ON public.saved_prompts 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM group_memberships 
    WHERE group_memberships.group_id = saved_prompts.group_id 
    AND group_memberships.user_id = auth.uid()
    AND group_memberships.role = 'admin'
  )
);

CREATE POLICY "Group admins can create saved prompts" 
ON public.saved_prompts 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by 
  AND EXISTS (
    SELECT 1 
    FROM group_memberships 
    WHERE group_memberships.group_id = saved_prompts.group_id 
    AND group_memberships.user_id = auth.uid()
    AND group_memberships.role = 'admin'
  )
);

CREATE POLICY "Group admins can update saved prompts" 
ON public.saved_prompts 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 
    FROM group_memberships 
    WHERE group_memberships.group_id = saved_prompts.group_id 
    AND group_memberships.user_id = auth.uid()
    AND group_memberships.role = 'admin'
  )
);

CREATE POLICY "Group admins can delete saved prompts" 
ON public.saved_prompts 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 
    FROM group_memberships 
    WHERE group_memberships.group_id = saved_prompts.group_id 
    AND group_memberships.user_id = auth.uid()
    AND group_memberships.role = 'admin'
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_saved_prompts_updated_at
BEFORE UPDATE ON public.saved_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();