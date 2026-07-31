-- ============================================================
-- Planet'Desk — Dossiers gérés par les utilisateurs
-- À exécuter APRÈS 0008_desk.sql.
-- Table des dossiers des espaces Documents (kind = 'documents')
-- et Liens & outils (kind = 'liens') : création, renommage et
-- suppression depuis l'application.
-- ============================================================

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- 'documents' | 'liens'
  name text not null,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

alter table public.folders enable row level security;

drop policy if exists "folders_all" on public.folders;
create policy "folders_all" on public.folders
  for all to authenticated using (true) with check (true);

-- Dossiers de départ
insert into public.folders (kind, name) values
  ('documents', 'Général'),
  ('documents', 'Projets'),
  ('documents', 'CR réunions'),
  ('documents', 'Contrats'),
  ('documents', 'Directives'),
  ('liens', 'Général'),
  ('liens', 'Communication'),
  ('liens', 'Gestion'),
  ('liens', 'Design')
on conflict (kind, name) do nothing;
