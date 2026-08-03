-- ============================================================
-- Planet'Desk — Correctif : récursion des politiques de profiles
-- À exécuter APRÈS 0021_claim_vocabulaire.sql. Script rejouable.
--
-- SYMPTÔME : impossible d'enregistrer les accès d'un salarié. La base
-- répondait « infinite recursion detected in policy for relation
-- "profiles" », et l'écran affichait « Configuration de la base
-- incomplète ».
--
-- CAUSE : deux politiques héritées de 0001 interrogeaient `profiles`
-- depuis une politique portant sur `profiles` :
--
--     exists (select 1 from public.profiles p
--             where p.id = auth.uid() and p.role = 'admin')
--
-- Tant que la lecture de `profiles` était ouverte à tous, PostgreSQL
-- s'en accommodait. Depuis 0017, où la lecture est filtrée, la boucle
-- est détectée et l'écriture échoue. C'est bien 0017 qui a déclenché le
-- défaut ; ces deux politiques auraient dû y être reprises comme les
-- autres.
--
-- CORRECTIF : elles passent par `is_admin()`, fonction `security
-- definer` qui lit la table sans repasser par les politiques — la même
-- solution que pour le chat en 0019.
-- ============================================================

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles for delete to authenticated
  using ((select public.is_admin()));

-- Même origine, même correctif : la modération des messages par un
-- administrateur interrogeait `profiles` de la même façon.
drop policy if exists "messages_admin_delete" on public.messages;
create policy "messages_admin_delete" on public.messages for delete to authenticated
  using ((select public.is_admin()));
