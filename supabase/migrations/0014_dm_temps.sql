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
create policy "time_entries_all" on public.time_entries
  for all to authenticated using (true) with check (true);
