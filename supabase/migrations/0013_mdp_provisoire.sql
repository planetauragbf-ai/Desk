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
