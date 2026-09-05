-- Apply after commerce-upgrade.sql. Prices and coupon eligibility are server-authoritative.
create table if not exists public.coupons (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
 title text not null default '',
 discount_type text not null check (discount_type in ('flat','percent')),
 value integer not null check (value > 0),
 min_subtotal integer not null default 0 check (min_subtotal >= 0),
 max_discount integer check (max_discount > 0),
 excluded_categories text[] not null default '{}',
 starts_at timestamptz,
 expires_at timestamptz,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 check (discount_type <> 'percent' or value <= 100),
 check (expires_at is null or starts_at is null or expires_at > starts_at)
);
alter table public.coupons enable row level security;
drop policy if exists coupons_public_read on public.coupons;
create policy coupons_public_read on public.coupons for select to anon, authenticated
 using (active and (starts_at is null or starts_at<=now()) and (expires_at is null or expires_at>now()));
drop policy if exists coupons_admin on public.coupons;
create policy coupons_admin on public.coupons for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.coupons from anon,authenticated;
grant select on public.coupons to anon;
grant select,insert,update,delete on public.coupons to authenticated;
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount integer not null default 0 check (discount>=0);

create or replace function public.quote_coupon(p_code text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.coupons%rowtype; item jsonb; product public.products%rowtype;
 subtotal bigint:=0; eligible bigint:=0; qty integer; amount bigint;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Your shopping bag is empty or invalid.'; end if;
 select * into c from public.coupons where code=upper(trim(p_code)) for share;
 if not found or not c.active then raise exception 'This coupon is not available.'; end if;
 if c.starts_at>now() then raise exception 'This coupon has not started yet.'; end if;
 if c.expires_at<=now() then raise exception 'This coupon has expired.'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  qty:=(item->>'quantity')::integer;
  if qty is null or qty<1 or qty>10 then raise exception 'Invalid product quantity.'; end if;
  select * into product from public.products where id=(item->>'id')::bigint and is_active;
  if not found then raise exception 'A product in your bag is unavailable.'; end if;
  subtotal:=subtotal+product.price::bigint*qty;
  if not exists(select 1 from unnest(c.excluded_categories) category where lower(category)=lower(product.category)) then eligible:=eligible+product.price::bigint*qty; end if;
 end loop;
 if subtotal<c.min_subtotal then raise exception 'Minimum order value for this coupon is Rs. %.',c.min_subtotal; end if;
 if eligible<=0 then raise exception 'This coupon does not apply to the products in your bag.'; end if;
 amount:=case when c.discount_type='percent' then floor(eligible*c.value/100.0)::bigint else c.value end;
 amount:=least(eligible,amount,coalesce(c.max_discount,amount));
 if amount<1 then raise exception 'This coupon cannot discount this order.'; end if;
 return jsonb_build_object('code',c.code,'title',c.title,'subtotal',subtotal,'discount',amount,'excluded_categories',c.excluded_categories);
end; $$;
revoke all on function public.quote_coupon(text,jsonb) from public;
grant execute on function public.quote_coupon(text,jsonb) to anon,authenticated;

create or replace function public.place_order_v3(p_customer_name text,p_phone text,p_address text,p_city text,p_state text,p_pincode text,p_payment_method text,p_items jsonb,p_coupon_code text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; quoted jsonb; order_id uuid; amount integer:=0;
begin
 if auth.uid() is null then raise exception 'Please sign in before placing an order.'; end if;
 -- v2 locks product rows and snapshots their current prices within this transaction.
 result:=public.place_order_v2(p_customer_name,p_phone,p_address,p_city,p_state,p_pincode,p_payment_method,p_items);
 order_id:=(result->>'id')::uuid;
 if trim(coalesce(p_coupon_code,''))<>'' then
  quoted:=public.quote_coupon(p_coupon_code,p_items);
  amount:=(quoted->>'discount')::integer;
  update public.orders set discount=amount,coupon_code=quoted->>'code',total=subtotal+shipping-amount where id=order_id;
 end if;
 return result||jsonb_build_object('discount',amount,'coupon_code',quoted->>'code','total',(result->>'total')::integer-amount);
end; $$;
revoke all on function public.place_order_v3(text,text,text,text,text,text,text,jsonb,text) from public;
grant execute on function public.place_order_v3(text,text,text,text,text,text,text,jsonb,text) to authenticated;
