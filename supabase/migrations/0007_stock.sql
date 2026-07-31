-- ============================================================
-- Planet'Projects — Module Planet'Stock (stockage & picking)
-- À exécuter APRÈS 0006_chat_liens.sql.
-- Regroupe dans CE projet Supabase les besoins de l'application de
-- gestion de stock viticole (ex-projet séparé « Stockage ») :
--  - app_state : état applicatif JSONB synchronisé en temps réel
--  - bucket "photos" : photos des références (URLs publiques pour
--    les fiches QR, écriture réservée aux utilisateurs connectés)
-- L'accès est réservé aux utilisateurs authentifiés de l'espace
-- interne (comptes créés par l'administrateur).
-- ============================================================

-- ---------- État applicatif Planet'Stock
create table if not exists public.app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "app_state_full_access" on public.app_state;
drop policy if exists "app_state_auth" on public.app_state;
create policy "app_state_auth" on public.app_state
  for all to authenticated
  using (true) with check (true);

-- ---------- Temps réel : synchro multi-appareils du stock
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null;
end $$;

-- ---------- Storage : bucket photos (public en lecture pour les fiches QR)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_read" on storage.objects;
create policy "photos_read" on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists "photos_insert" on storage.objects;
create policy "photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos');

drop policy if exists "photos_delete" on storage.objects;
create policy "photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos');
