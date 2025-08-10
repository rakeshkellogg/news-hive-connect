-- Grant super_admin role to the specified email if not already granted
insert into public.user_roles (user_id, role)
select p.user_id, 'super_admin'::app_role
from public.profiles p
where p.email = 'rakesh.nw.kellogg@gmail.com'
  and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.user_id and ur.role = 'super_admin'::app_role
  );