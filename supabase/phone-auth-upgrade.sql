-- Required before enabling phone signups. Preserve existing admin roles.
begin;
alter table public.profiles alter column email drop not null;
update public.profiles set email=null where email='';
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,phone,full_name,role)
 values(new.id,nullif(lower(new.email),''),coalesce(new.phone,''),coalesce(new.raw_user_meta_data->>'full_name',''),
 case when lower(new.email)='triptijewellers4826@gmail.com' and new.email_confirmed_at is not null then 'admin' else 'customer' end)
 on conflict(id) do update set email=excluded.email,phone=excluded.phone,
 full_name=case when public.profiles.full_name='' then excluded.full_name else public.profiles.full_name end;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email,phone,raw_user_meta_data on auth.users for each row execute procedure public.handle_new_user();
commit;
