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
