-- ============================================================
-- Planet AURA · Organisation — Schéma initial
-- Pilotage organisationnel : objectifs, plans d'actions, tâches,
-- workflows, notes, documents, décisions, indicateurs.
-- ============================================================

-- ---------- Instances (organigramme : sites, départements, équipes)
create table if not exists public.instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.instances(id) on delete set null,
  level int not null default 1,
  created_at timestamptz not null default now()
);

-- ---------- Profils (miroir de auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'membre', -- 'admin' | 'referent' | 'membre'
  instance_id uuid references public.instances(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Objectifs (hiérarchiques : cap stratégique -> sous-objectifs)
create table if not exists public.objectives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  expected_result text not null default '',       -- Attendu / livrable
  parent_id uuid references public.objectives(id) on delete cascade,
  instance_id uuid references public.instances(id) on delete set null,
  status text not null default 'non_initie',      -- 'non_initie' | 'en_cours' | 'termine'
  priority text not null default 'moyenne',       -- 'basse' | 'moyenne' | 'haute' | 'critique'
  start_date date,
  due_date date,
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- ---------- Tâches (plan d'actions d'un objectif)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid references public.objectives(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'a_faire',         -- 'a_faire' | 'en_cours' | 'validation' | 'termine'
  priority text not null default 'moyenne',
  due_date date,
  assignee_id uuid references public.profiles(id) on delete set null,
  workflow_group text,                            -- nom de l'étape du workflow d'origine (si issue d'un template)
  estimated_hours numeric,
  spent_hours numeric,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- Workflows (templates réutilisables : étapes -> actions)
create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'a_utiliser',      -- 'a_utiliser' | 'utilisee'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates(id) on delete cascade,
  position int not null default 0,
  title text not null
);

create table if not exists public.workflow_actions (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.workflow_steps(id) on delete cascade,
  position int not null default 0,
  title text not null
);

-- ---------- Notes (rattachées à un objectif ou une tâche, ou libres)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  objective_id uuid references public.objectives(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Documents (métadonnées ; fichier dans Supabase Storage, bucket "documents")
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  folder text not null default 'Général',
  storage_path text,
  url text,
  objective_id uuid references public.objectives(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Décisions (mémoire des arbitrages, par objectif)
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid references public.objectives(id) on delete cascade,
  title text not null,
  context text not null default '',
  status text not null default 'a_instruire',     -- 'a_instruire' | 'en_instruction' | 'arbitree'
  outcome text not null default '',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Indicateurs de résultat (par objectif : cible vs réalisé)
create table if not exists public.indicators (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.objectives(id) on delete cascade,
  name text not null,
  unit text not null default '',
  target_value numeric not null default 0,
  current_value numeric not null default 0,
  due_date date,
  updated_at timestamptz not null default now()
);

-- ---------- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- Application mono-organisation : tout utilisateur authentifié
-- de l'espace Planet AURA lit et écrit ; les notifications sont
-- personnelles.
-- ============================================================

alter table public.instances          enable row level security;
alter table public.profiles           enable row level security;
alter table public.objectives         enable row level security;
alter table public.tasks              enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.workflow_steps     enable row level security;
alter table public.workflow_actions   enable row level security;
alter table public.notes              enable row level security;
alter table public.documents          enable row level security;
alter table public.decisions          enable row level security;
alter table public.indicators         enable row level security;
alter table public.notifications      enable row level security;

drop policy if exists "instances_all" on public.instances;
create policy "instances_all"  on public.instances          for all to authenticated using (true) with check (true);
drop policy if exists "objectives_all" on public.objectives;
create policy "objectives_all" on public.objectives         for all to authenticated using (true) with check (true);
drop policy if exists "tasks_all" on public.tasks;
create policy "tasks_all"      on public.tasks              for all to authenticated using (true) with check (true);
drop policy if exists "wft_all" on public.workflow_templates;
create policy "wft_all"        on public.workflow_templates for all to authenticated using (true) with check (true);
drop policy if exists "wfs_all" on public.workflow_steps;
create policy "wfs_all"        on public.workflow_steps     for all to authenticated using (true) with check (true);
drop policy if exists "wfa_all" on public.workflow_actions;
create policy "wfa_all"        on public.workflow_actions   for all to authenticated using (true) with check (true);
drop policy if exists "notes_all" on public.notes;
create policy "notes_all"      on public.notes              for all to authenticated using (true) with check (true);
drop policy if exists "documents_all" on public.documents;
create policy "documents_all"  on public.documents          for all to authenticated using (true) with check (true);
drop policy if exists "decisions_all" on public.decisions;
create policy "decisions_all"  on public.decisions          for all to authenticated using (true) with check (true);
drop policy if exists "indicators_all" on public.indicators;
create policy "indicators_all" on public.indicators         for all to authenticated using (true) with check (true);

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications_write" on public.notifications;
create policy "notifications_write"  on public.notifications for insert to authenticated with check (true);
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update to authenticated using (user_id = auth.uid());
drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------- Storage : bucket documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_bucket_read" on storage.objects;
create policy "documents_bucket_read" on storage.objects for select to authenticated
  using (bucket_id = 'documents');
drop policy if exists "documents_bucket_write" on storage.objects;
create policy "documents_bucket_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');
drop policy if exists "documents_bucket_delete" on storage.objects;
create policy "documents_bucket_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents');
