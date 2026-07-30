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
create policy "poll_votes_all" on public.poll_votes
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.poll_votes;

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
create policy "leaves_all" on public.leaves
  for all to authenticated using (true) with check (true);

alter table public.profiles
  add column if not exists is_compta boolean not null default false;
alter table public.profiles
  add column if not exists cp_droits numeric not null default 25;
