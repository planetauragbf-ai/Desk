-- ============================================================
-- Planet'Projects — Gestion des accès salariés
-- À exécuter APRÈS 0001_init.sql.
--  - profiles.modules : liste des modules accessibles (null = tous)
--  - objective_members : projets/objectifs visibles par salarié
--    (l'accès s'hérite sur tout le sous-arbre de l'objectif)
-- ============================================================

alter table public.profiles
  add column if not exists modules text[];

create table if not exists public.objective_members (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.objectives(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (objective_id, profile_id)
);

alter table public.objective_members enable row level security;

drop policy if exists "objective_members_select" on public.objective_members;
create policy "objective_members_select" on public.objective_members
  for select to authenticated using (true);

-- Seuls les administrateurs modifient les attributions.
drop policy if exists "objective_members_admin_write" on public.objective_members;
create policy "objective_members_admin_write" on public.objective_members
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
