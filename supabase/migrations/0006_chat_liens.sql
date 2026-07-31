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
insert into public.channels (name, description)
values ('Général', 'Canal ouvert à toute l''équipe Planet Aura.')
on conflict (name) do nothing;
