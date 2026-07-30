-- ============================================================
-- Planet'Desk — SCRIPT D'INSTALLATION UNIQUE
-- À exécuter UNE FOIS dans le projet Supabase « Organisation » :
-- Dashboard → SQL Editor → New query → coller tout → Run.
-- Regroupe les migrations 0006 (chat + liens), 0007 (Planet'Stock)
-- et 0008 (accès par application). Ne touche pas aux données
-- existantes ni aux comptes.
-- Ensuite, pour la remise à zéro des données :
-- exécutez supabase/scripts/remise_a_zero.sql.
-- ============================================================

-- ============================================================
-- Planet'Projects — Chat interne, assistant et espace Liens & outils
-- À exécuter APRÈS 0005_validation.sql.
--  - channels / messages : messagerie interne par canal (temps réel)
--  - links : annuaire des outils, applications et raccourcis
-- ============================================================

-- ---------- Canaux de discussion
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name)
);

-- ---------- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at);

-- ---------- Liens & outils (annuaire des applications de l'équipe)
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null,
  description text not null default '',
  category text not null default 'Général',
  emoji text not null default '🔗',
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security (espace interne mono-organisation)
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.links    enable row level security;

create policy "channels_all" on public.channels for all to authenticated using (true) with check (true);
create policy "links_all"    on public.links    for all to authenticated using (true) with check (true);

create policy "messages_select" on public.messages for select to authenticated using (true);
create policy "messages_insert" on public.messages for insert to authenticated
  with check (author_id = auth.uid());
-- Chacun modifie/supprime ses messages ; les administrateurs modèrent tout.
create policy "messages_own_update" on public.messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "messages_own_delete" on public.messages for delete to authenticated
  using (author_id = auth.uid());
create policy "messages_admin_delete" on public.messages for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Temps réel : diffusion des nouveaux messages
alter publication supabase_realtime add table public.messages;

-- ---------- Canal par défaut
insert into public.channels (name, description)
values ('Général', 'Canal ouvert à toute l''équipe Planet Aura.')
on conflict (name) do nothing;
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
alter publication supabase_realtime add table public.app_state;

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
-- ============================================================
-- Planet'Desk — Accès par application gérés par l'administrateur
-- À exécuter APRÈS 0007_stock.sql.
--
-- L'application s'appelle désormais Planet'Desk : un portail unique
-- (une seule connexion) qui héberge Planet'Projects (pilotage) et
-- Planet'Stock (stockage & picking). L'administrateur crée les
-- comptes et définit, personne par personne, ce que chacun peut
-- faire dans chaque application.
--
--  - profiles.stock_access : droits Planet'Stock du salarié, ex.
--      {"role":"admin"}
--      {"role":"logisticien","permissions":{"entrees":true,"sorties":true,"espaces":true}}
--      {"role":"adherent","adherent_id":"ADH001"}
--    null = comportement par défaut (correspondance par email avec
--    un utilisateur/adhérent du stock ; les admins du Desk sont
--    admins du stock).
-- ============================================================

alter table public.profiles
  add column if not exists stock_access jsonb;
