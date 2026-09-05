-- Run once in the existing Supabase project's SQL Editor.
begin;
create table if not exists public.market_ticker (
  id text primary key check (id = 'main'),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.market_ticker enable row level security;
revoke all on public.market_ticker from anon, authenticated;
grant select on public.market_ticker to anon, authenticated;
grant insert, update on public.market_ticker to authenticated;
drop policy if exists market_ticker_read on public.market_ticker;
create policy market_ticker_read on public.market_ticker for select to anon, authenticated using (true);
drop policy if exists market_ticker_insert on public.market_ticker;
create policy market_ticker_insert on public.market_ticker for insert to authenticated with check ((select public.is_admin()));
drop policy if exists market_ticker_update on public.market_ticker;
create policy market_ticker_update on public.market_ticker for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop trigger if exists market_ticker_updated_at on public.market_ticker;
create trigger market_ticker_updated_at before update on public.market_ticker for each row execute procedure public.set_updated_at();
commit;
