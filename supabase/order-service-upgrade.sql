-- Requires the original setup.sql. Run in the Supabase SQL Editor.
begin;
create table if not exists public.order_service (
 order_id uuid primary key references public.orders(id) on delete cascade,
 courier text not null default '', awb text not null default '', tracking_url text not null default '',
 tracking_note text not null default '', updated_at timestamptz not null default now(),
 cancel_reason text, cancel_requested_at timestamptz,
 cancel_status text check(cancel_status in ('requested','approved','rejected')),
 cancel_reply text not null default ''
);
alter table public.order_service enable row level security;
revoke all on public.order_service from anon,authenticated;
grant select on public.order_service to authenticated;
drop policy if exists order_service_read on public.order_service;
create policy order_service_read on public.order_service for select to authenticated using (
 (select public.is_admin()) or exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid()))
);
create or replace function public.request_order_cancellation(p_order uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; s public.order_service;
begin
 select * into o from public.orders where id=p_order for update;
 if o.id is null or o.user_id is distinct from auth.uid() then raise exception 'Order not available'; end if;
 if o.status not in ('pending','confirmed','processing') then raise exception 'This order can no longer be cancelled here. Please contact support.'; end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>1000 then raise exception 'Please provide a cancellation reason (3–1000 characters).'; end if;
 select * into s from public.order_service where order_id=p_order;
 if s.cancel_status is not null then raise exception 'A cancellation request already exists for this order. Please contact support.'; end if;
 insert into public.order_service(order_id,cancel_reason,cancel_requested_at,cancel_status)
 values(p_order,trim(p_reason),now(),'requested') on conflict(order_id) do update set cancel_reason=excluded.cancel_reason,cancel_requested_at=excluded.cancel_requested_at,cancel_status='requested';
end; $$;
create or replace function public.manage_order_service(p_order uuid,p_courier text,p_awb text,p_url text,p_note text,p_decision text,p_reply text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; s public.order_service;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
 select * into o from public.orders where id=p_order for update;
 if o.id is null then raise exception 'Order not found'; end if;
 if length(coalesce(p_courier,''))>100 or length(coalesce(p_awb,''))>100 or length(coalesce(p_url,''))>2000 or length(coalesce(p_note,''))>1000 or length(coalesce(p_reply,''))>1000 then raise exception 'Details are too long'; end if;
 if coalesce(p_url,'')<>'' and p_url !~ '^https://' then raise exception 'Tracking URL must use HTTPS'; end if;
 insert into public.order_service(order_id) values(p_order) on conflict do nothing;
 select * into s from public.order_service where order_id=p_order for update;
 if coalesce(p_decision,'')<>'' then
  if p_decision not in ('approved','rejected') or s.cancel_status is distinct from 'requested' then raise exception 'No pending cancellation to review'; end if;
  if length(trim(coalesce(p_reply,'')))<3 then raise exception 'Enter a customer-facing decision note'; end if;
  if p_decision='approved' then
   if o.status not in ('pending','confirmed','processing') then raise exception 'Cannot cancel a dispatched or completed order here'; end if;
   update public.orders set status='cancelled' where id=p_order;
  end if;
 end if;
 update public.order_service set courier=coalesce(p_courier,''),awb=coalesce(p_awb,''),tracking_url=coalesce(p_url,''),tracking_note=coalesce(p_note,''),updated_at=now(),cancel_status=coalesce(nullif(p_decision,''),cancel_status),cancel_reply=case when coalesce(p_decision,'')<>'' then p_reply else cancel_reply end where order_id=p_order;
end; $$;
revoke all on function public.request_order_cancellation(uuid,text) from public,anon;
revoke all on function public.manage_order_service(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.request_order_cancellation(uuid,text) to authenticated;
grant execute on function public.manage_order_service(uuid,text,text,text,text,text,text) to authenticated;
commit;
