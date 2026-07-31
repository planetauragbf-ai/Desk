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
