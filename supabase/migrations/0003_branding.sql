-- ============================================================
-- Planet'Projects — Personnalisation (logo modifiable dans l'app)
-- À exécuter APRÈS 0002_permissions.sql.
--  - app_settings : réglages globaux (clé/valeur), ex. logo_url
--  - bucket public "branding" : stockage du fichier logo
-- ============================================================

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Lecture par tous (le logo s'affiche aussi sur l'écran de connexion).
create policy "app_settings_select" on public.app_settings
  for select to anon, authenticated using (true);

-- Seuls les administrateurs modifient les réglages.
create policy "app_settings_admin_write" on public.app_settings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Bucket public pour le logo.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "branding_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'branding');
create policy "branding_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "branding_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "branding_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
