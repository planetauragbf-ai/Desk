-- ============================================================
-- Planet'Desk — SCRIPT D'INSTALLATION COMPLET
-- Pour repartir d'un projet Supabase neuf :
-- Dashboard → SQL Editor → New query → coller tout → Run.
--
-- Contient l'intégralité du schéma : organisation et projets, chat,
-- liens & outils, Planet'Stock, Planet'Dash, Planet'Claim, calendrier
-- et congés, journal d'activité, sécurité (RLS) et index.
--
-- Le script est REJOUABLE : sur une base déjà installée il se contente
-- de remettre les politiques et les index en place, sans toucher aux
-- données. Pour vider les données de démonstration, exécutez ensuite
-- supabase/scripts/remise_a_zero.sql.
--
-- Fichier généré par supabase/scripts/generer.sh — ne pas modifier ici.
-- ============================================================



-- ############################################################
-- ### MIGRATION 0001_init
-- ############################################################

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


-- ############################################################
-- ### MIGRATION 0002_permissions
-- ############################################################

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


-- ############################################################
-- ### MIGRATION 0003_branding
-- ############################################################

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
drop policy if exists "app_settings_select" on public.app_settings;
create policy "app_settings_select" on public.app_settings
  for select to anon, authenticated using (true);

-- Seuls les administrateurs modifient les réglages.
drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Bucket public pour le logo.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "branding_read" on storage.objects;
create policy "branding_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'branding');
drop policy if exists "branding_admin_insert" on storage.objects;
create policy "branding_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "branding_admin_update" on storage.objects;
create policy "branding_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "branding_admin_delete" on storage.objects;
create policy "branding_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ############################################################
-- ### MIGRATION 0004_tasks_clients
-- ############################################################

-- ============================================================
-- Planet’Projects — Tâches : intervenant salarié ou client
-- À exécuter APRÈS 0003_branding.sql.
--  - assigned_kind : 'salarie' (référent interne via assignee_id)
--    ou 'client' (intervenant externe nommé dans external_name)
-- ============================================================

alter table public.tasks
  add column if not exists assigned_kind text not null default 'salarie',
  add column if not exists external_name text;


-- ############################################################
-- ### MIGRATION 0005_validation
-- ############################################################

-- ============================================================
-- Planet’Projects — Circuit de validation des tâches
-- À exécuter APRÈS 0004_tasks_clients.sql.
--  - validator_id : la personne désignée pour valider la tâche.
--    Quand l'exécutant termine, la tâche passe « en validation »
--    et le valideur est notifié ; il valide ou refuse.
-- ============================================================

alter table public.tasks
  add column if not exists validator_id uuid references public.profiles(id) on delete set null;


-- ############################################################
-- ### MIGRATION 0006_chat_liens
-- ############################################################

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

drop policy if exists "channels_all" on public.channels;
create policy "channels_all" on public.channels for all to authenticated using (true) with check (true);
drop policy if exists "links_all" on public.links;
create policy "links_all"    on public.links    for all to authenticated using (true) with check (true);

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated using (true);
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (author_id = auth.uid());
-- Chacun modifie/supprime ses messages ; les administrateurs modèrent tout.
drop policy if exists "messages_own_update" on public.messages;
create policy "messages_own_update" on public.messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "messages_own_delete" on public.messages;
create policy "messages_own_delete" on public.messages for delete to authenticated
  using (author_id = auth.uid());
drop policy if exists "messages_admin_delete" on public.messages;
create policy "messages_admin_delete" on public.messages for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- Temps réel : diffusion des nouveaux messages
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

-- ---------- Canal par défaut
-- Testé sur l'existence plutôt que par « on conflict » : 0019 remplace
-- l'unicité globale du nom par une unicité limitée aux canaux nommés.
insert into public.channels (name, description)
select 'Général', 'Canal ouvert à toute l''équipe Planet Aura.'
where not exists (select 1 from public.channels where name = 'Général');


-- ############################################################
-- ### MIGRATION 0007_stock
-- ############################################################

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


-- ############################################################
-- ### MIGRATION 0008_desk
-- ############################################################

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


-- ############################################################
-- ### MIGRATION 0009_dossiers
-- ############################################################

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


-- ############################################################
-- ### MIGRATION 0010_comptes
-- ############################################################

-- ============================================================
-- Planet'Desk — Contrôle fin des comptes par l'administrateur
-- À exécuter APRÈS 0009_dossiers.sql.
--  - profiles.disabled : accès désactivé (le salarié ne peut plus entrer)
--  - profiles.perms    : autorisations détaillées, ex.
--      {"chat_canaux":false,"documents_dossiers":false}
--    (null ou clé absente = autorisé ; false = interdit)
--  - suppression de profils réservée aux administrateurs
-- ============================================================

alter table public.profiles
  add column if not exists disabled boolean not null default false;

alter table public.profiles
  add column if not exists perms jsonb;

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ############################################################
-- ### MIGRATION 0011_journal
-- ############################################################

-- ============================================================
-- Planet'Desk — Journal d'activité global
-- À exécuter APRÈS 0010_comptes.sql.
-- Trace « qui a fait quoi » dans toute l'application (créations,
-- modifications, suppressions), avec l'application concernée pour
-- filtrer par sous-app. Consultable par les administrateurs dans
-- Gestion → Journal.
-- ============================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text not null default '',
  app text not null default 'desk',   -- 'projects' | 'stock' | 'chat' | 'documents' | 'liens' | 'administration' | 'desk'
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Tout utilisateur connecté écrit ses actions ; seuls les admins lisent.
drop policy if exists "audit_insert" on public.audit_log;
create policy "audit_insert" on public.audit_log
  for insert to authenticated with check (true);
drop policy if exists "audit_admin_select" on public.audit_log;
create policy "audit_admin_select" on public.audit_log
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- ############################################################
-- ### MIGRATION 0012_chat_calendrier
-- ############################################################

-- ============================================================
-- Planet'Desk — Chat enrichi et Calendrier / Congés
-- À exécuter APRÈS 0011_journal.sql.
--
-- Chat :
--  - canaux privés avec membres choisis (channel_members)
--  - pièces jointes (photos, PDF…) via le bucket "chat"
--  - questionnaires (sondages) dans les messages + votes
--
-- Calendrier / RH :
--  - leaves : absences, retards, congés, école, formation…
--    demande en ligne par le salarié, validation par un admin
--    PUIS par le service compta (profiles.is_compta)
--  - profiles.cp_droits : droits de congés payés annuels (jours)
-- ============================================================

-- ---------- Chat : canaux privés et membres
alter table public.channels
  add column if not exists private boolean not null default false;

create table if not exists public.channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (channel_id, profile_id)
);

alter table public.channel_members enable row level security;
drop policy if exists "channel_members_all" on public.channel_members;
create policy "channel_members_all" on public.channel_members
  for all to authenticated using (true) with check (true);

-- ---------- Chat : pièces jointes et sondages
alter table public.messages add column if not exists file_url text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_type text;   -- 'image' | 'pdf' | 'fichier'
alter table public.messages add column if not exists poll jsonb;       -- {"question":"…","options":["…"]}

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (message_id, profile_id)
);

alter table public.poll_votes enable row level security;
drop policy if exists "poll_votes_all" on public.poll_votes;
create policy "poll_votes_all" on public.poll_votes
  for all to authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null;
end $$;

-- ---------- Storage : bucket chat (photos et fichiers des messages)
insert into storage.buckets (id, name, public)
values ('chat', 'chat', true)
on conflict (id) do nothing;

drop policy if exists "chat_bucket_read" on storage.objects;
create policy "chat_bucket_read" on storage.objects
  for select using (bucket_id = 'chat');
drop policy if exists "chat_bucket_write" on storage.objects;
create policy "chat_bucket_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat');
drop policy if exists "chat_bucket_delete" on storage.objects;
create policy "chat_bucket_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'chat');

-- ---------- Calendrier / Congés
create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'conge',   -- 'conge' | 'maladie' | 'ecole' | 'formation' | 'teletravail' | 'recup' | 'absence' | 'retard'
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  status text not null default 'en_attente',  -- 'en_attente' | 'validee_admin' | 'validee' | 'refusee'
  admin_by uuid references public.profiles(id) on delete set null,
  admin_at timestamptz,
  compta_by uuid references public.profiles(id) on delete set null,
  compta_at timestamptz,
  refusal_reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists leaves_dates_idx on public.leaves (start_date, end_date);

alter table public.leaves enable row level security;
drop policy if exists "leaves_all" on public.leaves;
create policy "leaves_all" on public.leaves
  for all to authenticated using (true) with check (true);

alter table public.profiles
  add column if not exists is_compta boolean not null default false;
alter table public.profiles
  add column if not exists cp_droits numeric not null default 25;


-- ############################################################
-- ### MIGRATION 0013_mdp_provisoire
-- ############################################################

-- ============================================================
-- Planet'Desk — Création de comptes maîtrisée par l'admin
-- À exécuter APRÈS 0012_chat_calendrier.sql.
--  - profiles.must_change_password : le salarié doit changer son
--    mot de passe provisoire à sa première connexion
--  - profiles_self_insert : un utilisateur authentifié peut recréer
--    SON profil s'il a été supprimé (auto-réparation à la connexion,
--    ex. compte supprimé puis recréé par l'admin)
-- ============================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());


-- ############################################################
-- ### MIGRATION 0014_dm_temps
-- ############################################################

-- ============================================================
-- Planet'Desk — Messages privés et compteur d'heures à la minute
-- À exécuter APRÈS 0013_mdp_provisoire.sql.
--
--  - channels.dm : conversation privée type WhatsApp (à deux ou en
--    groupe). Visible UNIQUEMENT de ses membres — pas des admins.
--    N'importe quel salarié peut en créer.
--  - time_entries : heures supplémentaires et retards, à la minute,
--    rattachés au calendrier.
-- ============================================================

alter table public.channels
  add column if not exists dm boolean not null default false;

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'hsupp',   -- 'hsupp' | 'retard'
  date date not null,
  minutes int not null default 0,
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists time_entries_date_idx on public.time_entries (date);

alter table public.time_entries enable row level security;
drop policy if exists "time_entries_all" on public.time_entries;
create policy "time_entries_all" on public.time_entries
  for all to authenticated using (true) with check (true);


-- ############################################################
-- ### MIGRATION 0015_claim
-- ############################################################

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
drop policy if exists "claims_all" on public.claims;
create policy "claims_all" on public.claims
  for all to authenticated using (true) with check (true);
drop policy if exists "claim_events_all" on public.claim_events;
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


-- ############################################################
-- ### MIGRATION 0016_claim_v2
-- ############################################################

-- ============================================================
-- Planet'Claim v2 — Dossier complet aligné sur le suivi PA
-- À exécuter APRÈS 0015_claim.sql.
-- Sections : identification, client, commande, transport, sinistre,
-- réserves & recours transporteur, Coste Fermon (assureur),
-- indemnisation, prochaine action.
-- ============================================================

alter table public.claims add column if not exists client_nom text not null default '';
alter table public.claims add column if not exists client_email text not null default '';
alter table public.claims add column if not exists client_tel text not null default '';

alter table public.claims add column if not exists date_expedition date;
alter table public.claims add column if not exists date_livraison date;
alter table public.claims add column if not exists valeur_commande numeric not null default 0;

alter table public.claims add column if not exists lien_suivi text not null default '';
alter table public.claims add column if not exists lien_transporteur text not null default '';

alter table public.claims add column if not exists nb_bouteilles int not null default 0;
alter table public.claims add column if not exists lien_drive text not null default '';

alter table public.claims add column if not exists reserves text not null default '';
alter table public.claims add column if not exists lrar_le date;
alter table public.claims add column if not exists ar_le date;
alter table public.claims add column if not exists reponse_transporteur text not null default '';

alter table public.claims add column if not exists cf_declaration date;
alter table public.claims add column if not exists cf_dossier text not null default '';
alter table public.claims add column if not exists cf_interlocuteur text not null default '';
alter table public.claims add column if not exists cf_statut text not null default '';
alter table public.claims add column if not exists cf_relance date;

alter table public.claims add column if not exists montant_propose numeric not null default 0;
alter table public.claims add column if not exists date_accord date;
alter table public.claims add column if not exists date_versement date;

alter table public.claims add column if not exists prochaine_action text not null default '';
alter table public.claims add column if not exists action_echeance date;
alter table public.claims add column if not exists notes text not null default '';

-- Assureur par défaut : Coste Fermon
alter table public.claims alter column assureur set default 'Coste Fermon';


-- ############################################################
-- ### MIGRATION 0017_securite
-- ############################################################

-- ============================================================
-- Planet'Desk — Verrouillage de la sécurité (modèle « intermédiaire »)
-- À exécuter APRÈS 0016_claim_v2.sql.
--
-- Principe retenu :
--   • les SALARIÉS internes voient les données de travail entre eux
--     (transparence assumée) ;
--   • les ACTIONS SENSIBLES sont verrouillées côté base, plus seulement
--     à l'écran : gestion des accès, validation des congés, journal ;
--   • les ADHÉRENTS (clients externes) sont strictement cloisonnés :
--     ils n'accèdent qu'à leurs propres données de stock ;
--   • les CONVERSATIONS PRIVÉES ne sont lisibles que de leurs membres.
--
-- PERFORMANCE : toutes les fonctions de contexte sont appelées sous la
-- forme `(select …)`. PostgreSQL les évalue alors UNE SEULE FOIS par
-- requête (InitPlan) au lieu d'une fois par ligne — différence de
-- plusieurs ordres de grandeur sur les tables qui grossissent.
-- Script rejouable sans risque.
-- ============================================================

-- ---------- Contexte de l'appelant --------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.is_compta()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_compta from public.profiles where id = auth.uid()), false);
$$;

/** Salarié interne = tout compte qui n'est pas un adhérent (client externe). */
create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(stock_access->>'role', '') <> 'adherent' from public.profiles where id = auth.uid()),
    false);
$$;

/** Raccourci : administrateur OU service comptable. */
create or replace function public.is_rh()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' or coalesce(is_compta, false) from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin(), public.is_compta(), public.is_internal(), public.is_rh() to authenticated;

-- ---------- 1. Escalade de privilèges ----------------------------------
-- Sans ce garde-fou, un salarié pouvait se passer administrateur, s'ouvrir
-- tous les modules ou se réactiver lui-même par une simple requête API.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Contexte serveur : éditeur SQL Supabase, clé de service, migration,
  -- création automatique du profil à l'inscription. Aucun compte connecté
  -- n'est en cause — sans cette porte de sortie, plus personne ne pourrait
  -- nommer le tout premier administrateur. La clé publique de l'application
  -- ne passe jamais par ici : les politiques de profiles sont réservées au
  -- rôle « authenticated ».
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Auto-réparation d'un profil supprimé : toujours en simple membre.
    new.role := 'membre';
    new.modules := null;
    new.perms := null;
    new.stock_access := null;
    new.disabled := false;
    new.is_compta := false;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.modules is distinct from old.modules
     or new.perms is distinct from old.perms
     or new.stock_access is distinct from old.stock_access
     or new.disabled is distinct from old.disabled
     or new.is_compta is distinct from old.is_compta
     or new.cp_droits is distinct from old.cp_droits
  then
    raise exception 'Ces droits ne peuvent être modifiés que par un administrateur';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_privileges_trg on public.profiles;
create trigger guard_profile_privileges_trg
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Annuaire : réservé aux salariés internes (un adhérent ne voit que lui-même).
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_internal()));

-- ---------- 2. Conversations privées -----------------------------------
-- Le filtrage n'existait que côté navigateur : tous les messages privés
-- de l'entreprise étaient lisibles par n'importe quel compte.
-- Une seule sous-requête sur channels (accès par clé primaire).
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = messages.channel_id
        and (
          (coalesce(c.private, false) = false and coalesce(c.dm, false) = false and (select public.is_internal()))
          or c.created_by = (select auth.uid())
          or ((select public.is_admin()) and coalesce(c.dm, false) = false)
          or exists (
            select 1 from public.channel_members m
            where m.channel_id = c.id and m.profile_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "channels_all" on public.channels;
drop policy if exists "channels_select" on public.channels;
drop policy if exists "channels_insert" on public.channels;
drop policy if exists "channels_update" on public.channels;
drop policy if exists "channels_delete" on public.channels;
create policy "channels_select" on public.channels for select to authenticated
  using (
    (coalesce(private, false) = false and coalesce(dm, false) = false and (select public.is_internal()))
    or created_by = (select auth.uid())
    or ((select public.is_admin()) and coalesce(dm, false) = false)
    or exists (select 1 from public.channel_members m where m.channel_id = channels.id and m.profile_id = (select auth.uid()))
  );
create policy "channels_insert" on public.channels for insert to authenticated
  with check ((select public.is_internal()));
create policy "channels_update" on public.channels for update to authenticated
  using (created_by = (select auth.uid()) or ((select public.is_admin()) and coalesce(dm, false) = false));
create policy "channels_delete" on public.channels for delete to authenticated
  using (created_by = (select auth.uid()) or ((select public.is_admin()) and coalesce(dm, false) = false));

drop policy if exists "channel_members_all" on public.channel_members;
drop policy if exists "channel_members_select" on public.channel_members;
drop policy if exists "channel_members_write" on public.channel_members;
create policy "channel_members_select" on public.channel_members for select to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.channels c
      where c.id = channel_members.channel_id
        and (
          c.created_by = (select auth.uid())
          or coalesce(c.dm, false) = false
          or exists (select 1 from public.channel_members m2 where m2.channel_id = c.id and m2.profile_id = (select auth.uid()))
        )
    )
  );
create policy "channel_members_write" on public.channel_members for all to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or exists (select 1 from public.channels c where c.id = channel_members.channel_id and c.created_by = (select auth.uid()))
  )
  with check ((select public.is_internal()));

-- ---------- 3. Congés et heures : validation réservée -------------------
-- Chacun pouvait valider sa propre demande ou supprimer celle d'un collègue.
drop policy if exists "leaves_all" on public.leaves;
drop policy if exists "leaves_select" on public.leaves;
drop policy if exists "leaves_insert" on public.leaves;
drop policy if exists "leaves_update" on public.leaves;
drop policy if exists "leaves_delete" on public.leaves;
create policy "leaves_select" on public.leaves for select to authenticated
  using ((select public.is_internal()));
create policy "leaves_insert" on public.leaves for insert to authenticated
  with check (
    (select public.is_internal())
    -- Une demande se dépose pour soi, en attente ; admin/compta saisissent pour autrui.
    and ((profile_id = (select auth.uid()) and status = 'en_attente') or (select public.is_rh()))
  );
create policy "leaves_update" on public.leaves for update to authenticated
  using ((select public.is_rh()));
create policy "leaves_delete" on public.leaves for delete to authenticated
  using ((select public.is_rh()) or (profile_id = (select auth.uid()) and status = 'en_attente'));

drop policy if exists "time_entries_all" on public.time_entries;
drop policy if exists "time_entries_select" on public.time_entries;
drop policy if exists "time_entries_write" on public.time_entries;
create policy "time_entries_select" on public.time_entries for select to authenticated
  using ((select public.is_internal()));
create policy "time_entries_write" on public.time_entries for all to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_rh()))
  with check ((select public.is_internal()) and (profile_id = (select auth.uid()) or (select public.is_rh())));

-- ---------- 4. Données de travail : salariés internes uniquement --------
do $$
declare t text;
begin
  foreach t in array array['claims','claim_events','objectives','tasks','notes',
                           'documents','decisions','indicators','links','folders',
                           'workflow_templates','workflow_steps','workflow_actions',
                           'instances']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_all', t);
      execute format('drop policy if exists %I on public.%I', t || '_internal', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select public.is_internal())) with check ((select public.is_internal()))',
        t || '_internal', t);
    end if;
  end loop;
end $$;

-- Anciennes politiques ouvertes des migrations initiales.
drop policy if exists "wft_all" on public.workflow_templates;
drop policy if exists "wfs_all" on public.workflow_steps;
drop policy if exists "wfa_all" on public.workflow_actions;
drop policy if exists "instances_all" on public.instances;
drop policy if exists "objective_members_select" on public.objective_members;
drop policy if exists "objective_members_admin_write" on public.objective_members;
-- Les attributions de projets restent réservées aux administrateurs.
drop policy if exists "objective_members_internal" on public.objective_members;
create policy "objective_members_select" on public.objective_members for select to authenticated
  using ((select public.is_internal()));
create policy "objective_members_admin_write" on public.objective_members for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "poll_votes_all" on public.poll_votes;
create policy "poll_votes_all" on public.poll_votes for all to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_internal()))
  with check (profile_id = (select auth.uid()));

-- ---------- 5. Journal d'activité infalsifiable -------------------------
drop policy if exists "audit_insert" on public.audit_log;
create policy "audit_insert" on public.audit_log for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "audit_admin_select" on public.audit_log;
create policy "audit_admin_select" on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- ---------- 6. Notifications : plus d'usurpation ------------------------
drop policy if exists "notifications_write" on public.notifications;
create policy "notifications_write" on public.notifications for insert to authenticated
  with check ((select public.is_internal()));

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- 7. Planet'Stock : cloisonnement des adhérents ---------------
-- L'état du stock est un JSON monolithique : impossible à découper par RLS.
-- Les adhérents passent donc par une fonction qui ne leur renvoie QUE
-- leurs propres données ; l'accès direct à la table leur est fermé.
drop policy if exists "app_state_auth" on public.app_state;
drop policy if exists "app_state_full_access" on public.app_state;
drop policy if exists "app_state_internal" on public.app_state;
create policy "app_state_internal" on public.app_state for all to authenticated
  using ((select public.is_internal())) with check ((select public.is_internal()));

create or replace function public.stock_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  st jsonb;
  moi public.profiles%rowtype;
  adh_id text;
begin
  select * into moi from public.profiles where id = auth.uid();
  if moi.id is null then
    raise exception 'Authentification requise';
  end if;

  select value into st from public.app_state where key = 'pa-stock-clean2';
  if st is null then return null; end if;

  -- Salarié interne : état complet.
  if coalesce(moi.stock_access->>'role', '') <> 'adherent' then
    return st;
  end if;

  -- Adhérent : identification de sa fiche (id explicite, sinon email).
  adh_id := nullif(moi.stock_access->>'adherent_id', '');
  if adh_id is null then
    select a->>'id' into adh_id
      from jsonb_array_elements(coalesce(st->'adherents', '[]'::jsonb)) a
     where lower(coalesce(a->>'email', '')) = lower(coalesce(moi.email, ''))
     limit 1;
  end if;

  -- Un seul parcours par collection, filtré sur son identifiant.
  return jsonb_build_object(
    'adherents',  coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'adherents','[]'::jsonb))  x where x->>'id'          = adh_id), '[]'::jsonb),
    'references', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'references','[]'::jsonb)) x where x->>'adherentId'  = adh_id), '[]'::jsonb),
    'entrees',    coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'entrees','[]'::jsonb))    x where x->>'adherentId'  = adh_id), '[]'::jsonb),
    'sorties',    coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'sorties','[]'::jsonb))    x where x->>'adherentId'  = adh_id), '[]'::jsonb),
    'factures',   coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'factures','[]'::jsonb))   x where x->>'adherentId'  = adh_id), '[]'::jsonb),
    'espaces', '[]'::jsonb,
    'fournitures', '[]'::jsonb,
    'comptaMatiere', jsonb_build_object('pertes', '[]'::jsonb, 'documents', '[]'::jsonb),
    'users', '[]'::jsonb,
    'auditLog', '[]'::jsonb,
    'logo', st->'logo'
  );
end $$;

grant execute on function public.stock_state() to authenticated;

-- ---------- 8. Clé API Ship24 hors de portée du public ------------------
-- app_settings est lisible par les visiteurs anonymes (logos) : les secrets
-- n'y ont pas leur place.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

drop policy if exists "app_secrets_admin" on public.app_secrets;
create policy "app_secrets_admin" on public.app_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Reprise de la clé éventuellement déjà saisie, puis effacement du réglage public.
insert into public.app_secrets (key, value)
  select 'ship24_api_key', value from public.app_settings where key = 'ship24_api_key'
  on conflict (key) do update set value = excluded.value;
delete from public.app_settings where key = 'ship24_api_key';

-- Réglages publics (logos) : écriture réservée aux administrateurs,
-- avec l'appel de contexte optimisé.
drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));


-- ############################################################
-- ### MIGRATION 0018_performance
-- ############################################################

-- ============================================================
-- Planet'Desk — Performance et intégrité
-- À exécuter APRÈS 0017_securite.sql. Script rejouable.
--
--  1. Index sur toutes les clés étrangères et colonnes de filtrage
--     (indispensable dès que les politiques RLS font des sous-requêtes
--     et que les tables dépassent quelques centaines de lignes) ;
--  2. Contraintes d'intégrité sur les valeurs de statut (une valeur
--     inconnue écrite par l'API faisait planter l'interface) ;
--  3. Temps réel activé pour les notifications, canaux et membres —
--     la cloche ne se mettait à jour qu'au rechargement de la page.
-- ============================================================

-- ---------- 1. Index ----------------------------------------------------
-- Chaque index n'est créé que si sa table existe : le script reste
-- exécutable même sur une base où toutes les migrations ne sont pas
-- encore passées.
do $$
declare i record;
begin
  for i in
    select * from (values
      -- Planet'Projects
      ('tasks',            'tasks_objective_idx',        '(objective_id)'),
      ('tasks',            'tasks_assignee_idx',         '(assignee_id)'),
      ('tasks',            'tasks_validator_idx',        '(validator_id) where validator_id is not null'),
      ('tasks',            'tasks_due_idx',              '(due_date) where completed_at is null'),
      ('objectives',       'objectives_parent_idx',      '(parent_id)'),
      ('objectives',       'objectives_owner_idx',       '(owner_id)'),
      ('notes',            'notes_objective_idx',        '(objective_id)'),
      ('documents',        'documents_objective_idx',    '(objective_id)'),
      ('documents',        'documents_folder_idx',       '(folder)'),
      ('decisions',        'decisions_objective_idx',    '(objective_id)'),
      ('indicators',       'indicators_objective_idx',   '(objective_id)'),
      ('objective_members','objective_members_profile_idx', '(profile_id)'),
      ('workflow_steps',   'workflow_steps_template_idx', '(template_id)'),
      ('workflow_actions', 'workflow_actions_step_idx',  '(step_id)'),
      -- Espaces communs
      ('notifications',    'notifications_user_idx',     '(user_id, read, created_at desc)'),
      ('channel_members',  'channel_members_profile_idx','(profile_id)'),
      ('poll_votes',       'poll_votes_message_idx',     '(message_id)'),
      ('audit_log',        'audit_log_user_idx',         '(user_id)'),
      ('audit_log',        'audit_log_app_idx',          '(app, created_at desc)'),
      ('profiles',         'profiles_email_idx',         '(lower(email))'),
      -- Calendrier
      ('leaves',           'leaves_profile_idx',         '(profile_id, start_date)'),
      ('time_entries',     'time_entries_profile_idx',   '(profile_id, date)'),
      -- Planet'Claim
      ('claims',           'claims_assignee_idx',        '(assignee_id)'),
      ('claims',           'claims_deadline_idx',        '(deadline) where closed_at is null'),
      ('claims',           'claims_adherent_idx',        '(adherent)'),
      ('claims',           'claims_shipping_idx',        '(shipping_ref)'),
      ('claim_events',     'claim_events_claim_idx',     '(claim_id, created_at)'),
      -- Dossiers (0009)
      ('folders',          'folders_kind_idx',           '(kind)')
    ) as v(tbl, nom, cols)
  loop
    if to_regclass('public.' || i.tbl) is not null then
      execute format('create index if not exists %I on public.%I %s', i.nom, i.tbl, i.cols);
    end if;
  end loop;
end $$;

-- ---------- 2. Intégrité des valeurs ------------------------------------
-- « not valid » : les contraintes s'appliquent aux nouvelles écritures
-- sans bloquer sur d'éventuelles données historiques incohérentes.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('objectives', 'objectives_status_chk',  $q$status in ('non_initie','en_cours','termine')$q$),
      ('objectives', 'objectives_priority_chk',$q$priority in ('basse','moyenne','haute','critique')$q$),
      ('tasks',      'tasks_status_chk',       $q$status in ('a_faire','en_cours','validation','termine')$q$),
      ('tasks',      'tasks_priority_chk',     $q$priority in ('basse','moyenne','haute','critique')$q$),
      ('tasks',      'tasks_kind_chk',         $q$assigned_kind in ('salarie','client')$q$),
      ('decisions',  'decisions_status_chk',   $q$status in ('a_instruire','en_instruction','arbitree')$q$),
      ('profiles',   'profiles_role_chk',      $q$role in ('admin','referent','membre')$q$),
      ('leaves',     'leaves_type_chk',        $q$type in ('conge','maladie','ecole','formation','teletravail','recup','absence','retard')$q$),
      ('leaves',     'leaves_status_chk',      $q$status in ('en_attente','validee_admin','validee','refusee')$q$),
      ('leaves',     'leaves_dates_chk',       $q$start_date <= end_date$q$),
      ('time_entries','time_entries_kind_chk', $q$kind in ('hsupp','retard')$q$),
      ('time_entries','time_entries_min_chk',  $q$minutes >= 0$q$),
      ('claims',     'claims_status_chk',      $q$status in ('nouveau','en_cours','attente_transporteur','attente_assurance','attente_client','accepte','refuse','clos')$q$),
      ('claims',     'claims_category_chk',    $q$category in ('casse','perte','vol','retard','temperature','erreur_livraison','facturation','autre')$q$),
      ('claims',     'claims_priority_chk',    $q$priority in ('basse','moyenne','haute','critique')$q$),
      ('claim_events','claim_events_kind_chk', $q$kind in ('commentaire','statut','document')$q$)
    ) as v(tbl, nom, expr)
  loop
    if to_regclass('public.' || c.tbl) is not null
       and not exists (select 1 from pg_constraint where conname = c.nom) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.nom, c.expr);
    end if;
  end loop;

  if to_regclass('public.folders') is not null
     and not exists (select 1 from pg_constraint where conname = 'folders_kind_chk') then
    execute $q$alter table public.folders add constraint folders_kind_chk check (kind in ('documents','liens')) not valid$q$;
  end if;
end $$;

-- Référence de dossier sinistre unique (le compteur était calculé côté
-- navigateur : deux créations simultanées produisaient un doublon).
-- Si des doublons existent déjà, on ne bloque pas la migration : un
-- avertissement est remonté et l'unicité pourra être posée après le
-- nettoyage manuel des références en double.
do $$
declare doublons int;
begin
  if to_regclass('public.claims') is null then return; end if;
  select count(*) into doublons
    from (select ref from public.claims group by ref having count(*) > 1) d;
  if doublons > 0 then
    raise warning 'claims : % référence(s) en double, index unique non créé', doublons;
  else
    execute 'create unique index if not exists claims_ref_uniq on public.claims (ref)';
  end if;
end $$;

-- ---------- 3. Temps réel ----------------------------------------------
-- Sans publication, l'abonnement de la cloche ne recevait jamais rien.
do $$
declare t text;
begin
  foreach t in array array['notifications','channels','channel_members','leaves','claims']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;

-- ---------- 4. Statistiques --------------------------------------------
-- Le planificateur choisit ses index à partir de ces statistiques : sans
-- « analyze », les index créés ci-dessus peuvent rester ignorés.
do $$
declare t text;
begin
  foreach t in array array['profiles','tasks','objectives','messages','notifications','leaves','claims']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('analyze public.%I', t);
    end if;
  end loop;
end $$;


-- ############################################################
-- ### MIGRATION 0019_chat_recursion
-- ############################################################

-- ============================================================
-- Planet'Desk — Correctif : récursion infinie dans les politiques du chat
-- À exécuter APRÈS 0018_performance.sql. Script rejouable.
--
-- SYMPTÔME : depuis 0017, impossible de créer un canal de discussion
-- (ni d'en lire un). PostgreSQL renvoyait :
--   « infinite recursion detected in policy for relation "channels" »
--
-- CAUSE : la politique de lecture de `channels` interrogeait
-- `channel_members`, dont la politique de lecture interrogeait
-- `channels`. Chaque table attendait l'autre.
--
-- CORRECTIF : les questions « suis-je membre ? », « ai-je le droit de
-- voir cette conversation ? » et « en suis-je l'auteur ? » passent par
-- des fonctions `security definer`. Elles lisent la table directement,
-- sans repasser par les politiques — la boucle est cassée. Au passage
-- les trois politiques deviennent beaucoup plus courtes, et la règle de
-- visibilité n'est plus écrite en trois exemplaires qui pouvaient
-- diverger.
-- ============================================================

-- ---------- Fonctions de contexte du chat -------------------------------
/** Membre de la conversation ? Lecture hors RLS : c'est ce qui casse la
    récursion entre channels et channel_members. */
create or replace function public.is_channel_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members m
    where m.channel_id = cid and m.profile_id = auth.uid()
  );
$$;

/** Droit de voir la conversation — donc aussi ses messages et ses membres.
    Règle unique :
      • canal ouvert (ni privé ni conversation à deux) : tous les salariés ;
      • conversation privée ou à deux : son auteur et ses membres ;
      • un administrateur voit les canaux, jamais les conversations à deux. */
create or replace function public.can_see_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid
      and (
        (coalesce(c.private, false) = false and coalesce(c.dm, false) = false and public.is_internal())
        or c.created_by = auth.uid()
        or (public.is_admin() and coalesce(c.dm, false) = false)
        or public.is_channel_member(c.id)
      )
  );
$$;

/** Auteur de la conversation (peut gérer ses membres). */
create or replace function public.owns_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channels c where c.id = cid and c.created_by = auth.uid());
$$;

grant execute on function public.is_channel_member(uuid), public.can_see_channel(uuid),
                         public.owns_channel(uuid) to authenticated;

-- ---------- Politiques du chat, sans récursion --------------------------
drop policy if exists "channels_select" on public.channels;
create policy "channels_select" on public.channels for select to authenticated
  using (
    (coalesce(private, false) = false and coalesce(dm, false) = false and (select public.is_internal()))
    or created_by = (select auth.uid())
    or ((select public.is_admin()) and coalesce(dm, false) = false)
    or public.is_channel_member(id)
  );

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated
  using (public.can_see_channel(channel_id));

drop policy if exists "channel_members_select" on public.channel_members;
create policy "channel_members_select" on public.channel_members for select to authenticated
  using (profile_id = (select auth.uid()) or public.can_see_channel(channel_id));

drop policy if exists "channel_members_write" on public.channel_members;
create policy "channel_members_write" on public.channel_members for all to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or public.owns_channel(channel_id)
  )
  with check ((select public.is_internal()));

-- Les sondages suivent la visibilité de leur message.
drop policy if exists "poll_votes_all" on public.poll_votes;
drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select" on public.poll_votes for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = poll_votes.message_id and public.can_see_channel(m.channel_id)
  ));
drop policy if exists "poll_votes_write" on public.poll_votes;
create policy "poll_votes_write" on public.poll_votes for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ---------- Conversations à deux : plus de collision de nom -------------
-- `channels` porte une contrainte d'unicité sur `name` depuis 0006. Les
-- conversations à deux sont créées sans nom : la deuxième échouait sur un
-- doublon de chaîne vide. L'unicité ne concerne désormais que les canaux
-- nommés (les conversations privées sont identifiées par leurs membres).
alter table public.channels drop constraint if exists channels_name_key;
drop index if exists public.channels_name_uniq;
create unique index if not exists channels_name_uniq
  on public.channels (name) where coalesce(dm, false) = false;
