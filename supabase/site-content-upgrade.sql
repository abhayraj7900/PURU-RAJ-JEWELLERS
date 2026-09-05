-- Footer, information pages, stores and delivery areas.
-- Apply only when the owner asks to activate the changes online.
create table if not exists public.site_content (
  id text primary key check (id = 'main'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
drop policy if exists "site_content_public_read" on public.site_content;
create policy "site_content_public_read" on public.site_content for select to anon, authenticated using (true);
drop policy if exists "site_content_admin_write" on public.site_content;
create policy "site_content_admin_write" on public.site_content for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon;
grant select, insert, update, delete on public.site_content to authenticated;
drop trigger if exists site_content_updated_at on public.site_content;
create trigger site_content_updated_at before update on public.site_content
for each row execute procedure public.set_updated_at();
