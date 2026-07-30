-- ============================================================
-- Planet'Claim — Gestion des sinistres et litiges
-- À exécuter APRÈS 0014_dm_temps.sql.
--
--  - claims : dossiers de sinistre (casse, perte, vol, retard,
--    température…) et de litige (facturation, erreur de livraison…),
--    avec workflow d'instruction, montants et délais de réclamation
--  - claim_events : historique du dossier (commentaires, changements
--    de statut, documents joints)
--  - bucket "claims" : pièces des dossiers (photos, PV, factures…)
-- ============================================================

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  ref text not null,                      -- SIN-2026-001 / LIT-2026-001
  kind text not null default 'sinistre',  -- 'sinistre' | 'litige'
  category text not null default 'casse', -- 'casse'|'perte'|'vol'|'retard'|'temperature'|'erreur_livraison'|'facturation'|'autre'
  status text not null default 'nouveau', -- 'nouveau'|'en_cours'|'attente_transporteur'|'attente_assurance'|'attente_client'|'accepte'|'refuse'|'clos'
  priority text not null default 'moyenne',
  title text not null,
  description text not null default '',
  shipping_ref text not null default '',  -- n° d'expédition / dossier back-office
  tracking_number text not null default '',
  carrier text not null default '',
  adherent text not null default '',      -- client / adhérent concerné
  destinataire text not null default '',
  pays text not null default '',
  date_incident date,
  deadline date,                          -- date limite de réclamation transporteur/assureur
  montant_estime numeric not null default 0,
  montant_reclame numeric not null default 0,
  montant_recupere numeric not null default 0,
  assureur text not null default '',
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists claims_status_idx on public.claims (status);

create table if not exists public.claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'commentaire',  -- 'commentaire' | 'statut' | 'document'
  content text not null default '',
  file_url text,
  file_name text,
  created_at timestamptz not null default now()
);

alter table public.claims enable row level security;
alter table public.claim_events enable row level security;
create policy "claims_all" on public.claims
  for all to authenticated using (true) with check (true);
create policy "claim_events_all" on public.claim_events
  for all to authenticated using (true) with check (true);

-- ---------- Storage : pièces des dossiers
insert into storage.buckets (id, name, public)
values ('claims', 'claims', true)
on conflict (id) do nothing;

drop policy if exists "claims_bucket_read" on storage.objects;
create policy "claims_bucket_read" on storage.objects
  for select using (bucket_id = 'claims');
drop policy if exists "claims_bucket_write" on storage.objects;
create policy "claims_bucket_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'claims');
drop policy if exists "claims_bucket_delete" on storage.objects;
create policy "claims_bucket_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'claims');
