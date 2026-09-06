-- Run AFTER setup.sql, commerce-upgrade.sql and order-service-upgrade.sql.
-- No historical notifications or cancelled-order stock are replayed.
begin;
alter table public.products add column if not exists low_stock_threshold integer not null default 3 check(low_stock_threshold>=0);
create table if not exists public.stock_restorations (
 order_id uuid primary key references public.orders(id), restored_at timestamptz not null default now()
);
alter table public.stock_restorations enable row level security;
revoke all on public.stock_restorations from anon,authenticated;
grant select on public.stock_restorations to authenticated;
drop policy if exists stock_admin_read on public.stock_restorations;
create policy stock_admin_read on public.stock_restorations for select to authenticated using(public.is_admin());
create or replace function public.restore_cancelled_stock() returns trigger
language plpgsql security definer set search_path='' as $$
declare restored uuid; item record;
begin
 if old.status='cancelled' and new.status<>'cancelled' then
  raise exception 'Cancelled orders cannot be reopened. Create a new order to reserve stock.';
 end if;
 if new.status='cancelled' and old.status<>'cancelled' then
  if old.status in ('shipped','delivered') then raise exception 'Use return processing for dispatched orders; cancellation cannot restore their stock.'; end if;
  insert into public.stock_restorations(order_id) values(new.id) on conflict do nothing returning order_id into restored;
  if restored is not null then
   for item in select product_id,sum(quantity)::integer qty from public.order_items where order_id=new.id and product_id is not null group by product_id order by product_id loop
    update public.products set stock=stock+item.qty where id=item.product_id;
   end loop;
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists restore_cancelled_stock on public.orders;
create trigger restore_cancelled_stock before update of status on public.orders for each row execute function public.restore_cancelled_stock();

create table if not exists public.customer_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 order_email boolean not null default true, order_whatsapp boolean not null default false,
 cart_reminders boolean not null default false, updated_at timestamptz not null default now()
);
alter table public.customer_preferences enable row level security;
revoke all on public.customer_preferences from anon,authenticated;
grant select,insert,update on public.customer_preferences to authenticated;
drop policy if exists preferences_own on public.customer_preferences;
create policy preferences_own on public.customer_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.aftercare_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 order_item_id bigint not null references public.order_items(id),
 kind text not null check(kind in ('return','exchange')), reason text not null check(length(trim(reason)) between 3 and 1000),
 photo_path text not null default '', status text not null default 'requested' check(status in ('requested','approved','rejected','completed')),
 admin_note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(order_item_id)
);
create table if not exists public.product_reviews (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 product_id bigint not null references public.products(id), order_item_id bigint not null references public.order_items(id),
 rating integer not null check(rating between 1 and 5), display_name text not null check(length(trim(display_name)) between 1 and 40),
 review text not null check(length(trim(review)) between 3 and 1500), photo_path text not null default '', created_at timestamptz not null default now(),
 unique(user_id,product_id)
);
create table if not exists public.appointments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('Store visit','Video shopping','Custom jewellery')),
 requested_at timestamptz not null, phone text not null check(phone ~ '^\+?[0-9]{10,15}$'), note text not null default '',
 status text not null default 'requested' check(status in ('requested','confirmed','cancelled','completed')),
 admin_note text not null default '', created_at timestamptz not null default now()
);
create unique index if not exists appointments_confirmed_slot on public.appointments(requested_at) where status='confirmed';
create index if not exists aftercare_customer on public.aftercare_requests(user_id,created_at desc);
create index if not exists reviews_product on public.product_reviews(product_id,created_at desc);
create index if not exists appointments_customer on public.appointments(user_id,created_at desc);
create table if not exists public.store_outbox (
 id bigint generated by default as identity primary key, event_key text not null unique,
 user_id uuid not null references auth.users(id), order_id uuid references public.orders(id), event text not null,
 channel text not null check(channel in ('email','whatsapp')), status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),
 attempts integer not null default 0, created_at timestamptz not null default now(), locked_at timestamptz, first_attempt_at timestamptz, sent_at timestamptz,
 provider_id text not null default '', last_error text not null default ''
);
create index if not exists store_outbox_pending on public.store_outbox(status,created_at);
alter table public.aftercare_requests enable row level security;
alter table public.product_reviews enable row level security;
alter table public.appointments enable row level security;
alter table public.store_outbox enable row level security;
revoke all on public.aftercare_requests,public.product_reviews,public.appointments,public.store_outbox from anon,authenticated;
grant select on public.aftercare_requests,public.product_reviews,public.appointments,public.store_outbox to authenticated;
drop policy if exists aftercare_read on public.aftercare_requests;
create policy aftercare_read on public.aftercare_requests for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists reviews_read on public.product_reviews;
create policy reviews_read on public.product_reviews for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists outbox_read on public.store_outbox;
create policy outbox_read on public.store_outbox for select to authenticated using(public.is_admin());

-- Photos: private return evidence, explicitly public review photos. Raster only, 5 MB.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('return-evidence','return-evidence',false,5242880,array['image/jpeg','image/png','image/webp']),
 ('review-photos','review-photos',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists customer_photo_insert on storage.objects;
create policy customer_photo_insert on storage.objects for insert to authenticated with check(
 bucket_id in ('return-evidence','review-photos') and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.orders where user_id=auth.uid() and status='delivered')
);
drop policy if exists customer_photo_read on storage.objects;
create policy customer_photo_read on storage.objects for select to authenticated using(
 bucket_id in ('return-evidence','review-photos') and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);
drop policy if exists published_review_photo on storage.objects;
create policy published_review_photo on storage.objects for select to anon,authenticated using(bucket_id='review-photos');

create or replace function public.submit_aftercare(p_item bigint,p_kind text,p_reason text,p_photo text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where i.id=p_item and o.user_id=auth.uid() and o.status='delivered') then raise exception 'Only your delivered orders are eligible.'; end if;
 if p_photo<>'' and not exists(select 1 from storage.objects where bucket_id='return-evidence' and name=p_photo and (storage.foldername(name))[1]=auth.uid()::text) then raise exception 'Upload your evidence photo first.'; end if;
 insert into public.aftercare_requests(user_id,order_item_id,kind,reason,photo_path) values(auth.uid(),p_item,p_kind,trim(p_reason),p_photo) returning id into result;
 return result;
end; $$;
create or replace function public.submit_review(p_item bigint,p_rating integer,p_name text,p_review text,p_photo text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare product bigint; result uuid;
begin
 select i.product_id into product from public.order_items i join public.orders o on o.id=i.order_id where i.id=p_item and o.user_id=auth.uid() and o.status='delivered';
 if product is null then raise exception 'A delivered purchase is required to review this product.'; end if;
 if p_photo<>'' and not exists(select 1 from storage.objects where bucket_id='review-photos' and name=p_photo and (storage.foldername(name))[1]=auth.uid()::text) then raise exception 'Upload your review photo first.'; end if;
 insert into public.product_reviews(user_id,product_id,order_item_id,rating,display_name,review,photo_path) values(auth.uid(),product,p_item,p_rating,trim(p_name),trim(p_review),p_photo) returning id into result;
 return result;
end; $$;
create or replace function public.read_product_reviews(p_product bigint) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from
 (select rating,display_name,review,photo_path,created_at from public.product_reviews where product_id=p_product order by created_at desc limit 100) r;
$$;
create or replace function public.book_appointment(p_kind text,p_time timestamptz,p_phone text,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if p_time is null or p_time<now()+interval '1 hour' or p_time>now()+interval '180 days' then raise exception 'Choose a time between one hour and 180 days from now.'; end if;
 if length(p_note)>1000 then raise exception 'Notes must be under 1000 characters.'; end if;
 if (select count(*) from public.appointments where user_id=auth.uid() and status in ('requested','confirmed'))>=3 then raise exception 'You already have three active appointments. Contact us to reschedule.'; end if;
 insert into public.appointments(user_id,kind,requested_at,phone,note) values(auth.uid(),p_kind,p_time,trim(p_phone),p_note) returning id into result;
 return result;
end; $$;
create or replace function public.manage_store_request(p_type text,p_id uuid,p_status text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Admin access required.'; end if;
 if length(trim(coalesce(p_note,'')))<3 or length(p_note)>1000 then raise exception 'Provide a customer-facing note (3–1000 characters).'; end if;
 if p_type='aftercare' then
  select status into previous from public.aftercare_requests where id=p_id for update;
  if not ((previous='requested' and p_status in ('approved','rejected')) or (previous='approved' and p_status='completed')) then raise exception 'Invalid return/exchange transition.'; end if;
  update public.aftercare_requests set status=p_status,admin_note=p_note,updated_at=now() where id=p_id;
 elsif p_type='appointment' then
  select status into previous from public.appointments where id=p_id for update;
  if not ((previous='requested' and p_status in ('confirmed','cancelled')) or (previous='confirmed' and p_status in ('completed','cancelled'))) then raise exception 'Invalid appointment transition.'; end if;
  update public.appointments set status=p_status,admin_note=p_note where id=p_id;
 else raise exception 'Unknown request type.';
 end if;
 if previous is null then raise exception 'Request not found.'; end if;
end; $$;

create or replace function public.queue_order_updates() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_name text; prefs public.customer_preferences;
begin
 if tg_op='UPDATE' then if new.status=old.status then return new; end if; end if;
 event_name:=case new.status when 'pending' then 'order_received' when 'confirmed' then 'order_confirmed' when 'shipped' then 'order_shipped' when 'delivered' then 'order_delivered' when 'cancelled' then 'order_cancelled' else null end;
 if event_name is null then return new; end if;
 select * into prefs from public.customer_preferences where user_id=new.user_id;
 if coalesce(prefs.order_email,true) then
  insert into public.store_outbox(event_key,user_id,order_id,event,channel) values(new.id::text||':'||event_name||':email',new.user_id,new.id,event_name,'email') on conflict do nothing;
 end if;
 if coalesce(prefs.order_whatsapp,false) then
  insert into public.store_outbox(event_key,user_id,order_id,event,channel) values(new.id::text||':'||event_name||':whatsapp',new.user_id,new.id,event_name,'whatsapp') on conflict do nothing;
 end if;
 return new;
end; $$;
drop trigger if exists queue_order_updates on public.orders;
create trigger queue_order_updates after insert or update of status on public.orders for each row execute function public.queue_order_updates();

-- Called only by the secret-backed dispatcher, never a customer's browser.
create or replace function public.enqueue_cart_reminders() returns void
language sql security definer set search_path='' as $$
 insert into public.store_outbox(event_key,user_id,event,channel)
 select 'cart:'||c.user_id::text||':'||max(c.updated_at)::text,c.user_id,'cart_reminder','email'
 from public.cart_items c join public.customer_preferences p on p.user_id=c.user_id and p.cart_reminders
 group by c.user_id having max(c.updated_at)<now()-interval '24 hours'
 and not exists(select 1 from public.orders o where o.user_id=c.user_id and o.created_at>=max(c.updated_at))
 and not exists(select 1 from public.store_outbox n where n.user_id=c.user_id and n.event='cart_reminder' and n.created_at>now()-interval '7 days')
 on conflict do nothing;
$$;
create or replace function public.claim_store_notifications(p_channels text[] default array['email','whatsapp']) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.store_outbox; prefs public.customer_preferences; o public.orders; destination text; result jsonb:='[]';
begin
 update public.store_outbox set status='failed',last_error='Interrupted delivery. Reconcile provider logs before manual retry.' where status='processing' and attempts>=5 and locked_at<now()-interval '10 minutes';
 for job in select * from public.store_outbox where channel=any(p_channels) and (status in ('pending','failed') or (status='processing' and locked_at<now()-interval '10 minutes')) and attempts<5 order by id limit 20 for update skip locked loop
  select * into prefs from public.customer_preferences where user_id=job.user_id;
  select * into o from public.orders where id=job.order_id;
  if job.order_id is not null and job.event is distinct from (case o.status when 'pending' then 'order_received' when 'confirmed' then 'order_confirmed' when 'shipped' then 'order_shipped' when 'delivered' then 'order_delivered' when 'cancelled' then 'order_cancelled' else '' end) then
   update public.store_outbox set status='skipped',last_error='Superseded by a newer order status' where id=job.id; continue;
  end if;
  if (job.event='cart_reminder' and (not coalesce(prefs.cart_reminders,false) or not exists(select 1 from public.cart_items where user_id=job.user_id) or exists(select 1 from public.cart_items where user_id=job.user_id and updated_at>now()-interval '24 hours') or exists(select 1 from public.orders where user_id=job.user_id and created_at>=job.created_at)))
   or (job.event<>'cart_reminder' and ((job.channel='email' and not coalesce(prefs.order_email,true)) or (job.channel='whatsapp' and not coalesce(prefs.order_whatsapp,false)))) then
   update public.store_outbox set status='skipped',last_error='Consent withdrawn, cart empty or order placed' where id=job.id; continue;
  end if;
  if job.channel='whatsapp' then destination:=o.phone; else
   if job.order_id is not null then destination:=o.email; else select email into destination from public.profiles where id=job.user_id; end if;
  end if;
  if coalesce(destination,'')='' then update public.store_outbox set status='skipped',last_error='Contact unavailable' where id=job.id; continue; end if;
  update public.store_outbox set status='processing',attempts=attempts+1,locked_at=now(),first_attempt_at=coalesce(first_attempt_at,now()) where id=job.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'event_key',job.event_key,'event',job.event,'channel',job.channel,'destination',destination,'order_number',o.order_number,'first_attempt_at',coalesce(job.first_attempt_at,now())));
 end loop;
 return result;
end; $$;

revoke all on function public.restore_cancelled_stock(),public.queue_order_updates(),public.enqueue_cart_reminders(),public.claim_store_notifications(text[]) from public,anon,authenticated;
grant execute on function public.enqueue_cart_reminders(),public.claim_store_notifications(text[]) to service_role;
revoke all on function public.submit_aftercare(bigint,text,text,text),public.submit_review(bigint,integer,text,text,text),public.book_appointment(text,timestamptz,text,text),public.manage_store_request(text,uuid,text,text),public.read_product_reviews(bigint) from public,anon,authenticated;
grant execute on function public.submit_aftercare(bigint,text,text,text),public.submit_review(bigint,integer,text,text,text),public.book_appointment(text,timestamptz,text,text),public.manage_store_request(text,uuid,text,text) to authenticated;
grant execute on function public.read_product_reviews(bigint) to anon,authenticated;
grant all on public.store_outbox to service_role;
grant usage,select on sequence public.store_outbox_id_seq to service_role;
create or replace function public.low_stock_products() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Admin access required.'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from (select id,name,stock,low_stock_threshold from public.products where is_active and stock<=low_stock_threshold order by stock,name) p);
end; $$;
create or replace function public.store_sales_report(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Admin access required.'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to 366 days.'; end if;
 with selected as (
  select *, (created_at at time zone 'Asia/Kolkata')::date as day from public.orders
  where status in ('confirmed','processing','shipped','delivered')
  and created_at>=p_from::timestamp at time zone 'Asia/Kolkata'
  and created_at<(p_to+1)::timestamp at time zone 'Asia/Kolkata'
 ), daily as (select day,count(*) orders,sum(total) total from selected group by day order by day),
 monthly as (select to_char(day,'YYYY-MM') as month,count(*) orders,sum(total) total from selected group by to_char(day,'YYYY-MM') order by month),
 best as (select i.product_id,max(i.product_name) name,sum(i.quantity) units,sum(i.price::bigint*i.quantity) total from public.order_items i join selected o on o.id=i.order_id group by i.product_id order by units desc limit 20)
 select jsonb_build_object('orders',(select count(*) from selected),'total',(select coalesce(sum(total),0) from selected),
 'pending',(select count(*) from public.orders where status='pending'),
 'daily',(select coalesce(jsonb_agg(to_jsonb(daily)),'[]') from daily),
 'monthly',(select coalesce(jsonb_agg(to_jsonb(monthly)),'[]') from monthly),
 'products',(select coalesce(jsonb_agg(to_jsonb(best)),'[]') from best)) into result;
 return result;
end; $$;
revoke all on function public.low_stock_products(),public.store_sales_report(date,date) from public,anon;
grant execute on function public.low_stock_products(),public.store_sales_report(date,date) to authenticated;
commit;
