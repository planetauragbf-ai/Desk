-- ============================================================
-- Planet'Stock AUTONOME — installation sur le projet « Stockage »
-- ============================================================
-- À exécuter dans l'éditeur SQL du projet Supabase historique
-- « Stockage » (celui de Planet'Stock), APRÈS l'avoir repris
-- depuis le tableau de bord (bouton « Restore » / « Reprendre »).
--
-- Ce script est REJOUABLE : le relancer ne casse rien.
-- Il ne supprime AUCUNE donnée existante : il ajoute autour de
-- vos données ce que la version actuelle de l'application attend
--   1. la fonction de lecture stock_state() (cloisonnement des
--      adhérents : chacun ne reçoit que ses propres données) ;
--   2. des droits d'écriture réservés aux comptes internes ;
--   3. la synchronisation temps réel et le bucket photos ;
--   4. votre compte administrateur.
--
-- ⚠️ UNE SEULE LIGNE À MODIFIER avant d'exécuter : tout en bas,
--    remplacez CHANGEZ-MOI par le mot de passe administrateur de
--    votre choix (le script refuse de s'exécuter sinon).
--
-- 💡 Pensez aussi, dans le tableau de bord Supabase :
--    Authentication → Sign In / Providers → Email →
--    décochez « Confirm email ». Sans cela, la première connexion
--    de chaque personne attend un clic dans un email de
--    confirmation.
-- ============================================================

-- ---------- 1. État applicatif (existe déjà sur le projet historique,
--               « if not exists » le crée seulement s'il manque)
create table if not exists public.app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- Les très vieilles versions de la table n'avaient pas updated_at,
-- que l'application renseigne à chaque sauvegarde.
alter table public.app_state add column if not exists updated_at timestamptz not null default now();

alter table public.app_state enable row level security;

-- ---------- 2. « Suis-je un compte interne ? » (admin ou logisticien)
-- Le rôle vit dans l'état JSONB lui-même (liste « users ») : la fonction
-- est « security definer » pour lire la table sans repasser par les
-- politiques — sinon la politique s'interrogerait elle-même (récursion,
-- le piège déjà corrigé côté Desk en 0019/0022).
create or replace function public.stock_est_interne()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.app_state s,
           jsonb_array_elements(coalesce(s.value->'users', '[]'::jsonb)) u
     where s.key = 'pa-stock-clean2'
       and lower(coalesce(u->>'email','')) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;
revoke execute on function public.stock_est_interne() from public;
grant execute on function public.stock_est_interne() to authenticated;

-- ---------- 3. Politiques : lecture directe et écriture réservées aux
--               internes ; les adhérents lisent via stock_state() qui
--               filtre leurs données côté serveur.
drop policy if exists "app_state_full_access" on public.app_state;
drop policy if exists "app_state_auth" on public.app_state;
drop policy if exists "app_state_internal" on public.app_state;
drop policy if exists "app_state_interne" on public.app_state;
create policy "app_state_interne" on public.app_state for all to authenticated
  using ((select public.stock_est_interne()))
  with check ((select public.stock_est_interne()));

-- ---------- 4. Lecture cloisonnée : état complet pour un interne,
--               données du seul adhérent concerné sinon.
-- Même logique que la version Desk (0017), le rôle étant déterminé ici
-- par l'email du compte connecté, comparé aux listes de l'état JSONB.
create or replace function public.stock_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  st jsonb;
  em text;
  adh_id text;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  em := lower(coalesce(auth.jwt()->>'email',''));

  select value into st from public.app_state where key = 'pa-stock-clean2';
  if st is null then return null; end if;

  -- Compte interne (liste « users » de l'état) : état complet.
  if exists (
    select 1 from jsonb_array_elements(coalesce(st->'users','[]'::jsonb)) u
     where lower(coalesce(u->>'email','')) = em
  ) then
    return st;
  end if;

  -- Adhérent : identification de sa fiche par email.
  select a->>'id' into adh_id
    from jsonb_array_elements(coalesce(st->'adherents','[]'::jsonb)) a
   where lower(coalesce(a->>'email','')) = em
   limit 1;
  if adh_id is null then return null; end if;

  -- Un seul parcours par collection, filtré sur son identifiant.
  return jsonb_build_object(
    'adherents',  coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'adherents','[]'::jsonb))  x where x->>'id'         = adh_id), '[]'::jsonb),
    'references', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'references','[]'::jsonb)) x where x->>'adherentId' = adh_id), '[]'::jsonb),
    'entrees',    coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'entrees','[]'::jsonb))    x where x->>'adherentId' = adh_id), '[]'::jsonb),
    'sorties',    coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'sorties','[]'::jsonb))    x where x->>'adherentId' = adh_id), '[]'::jsonb),
    'factures',   coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(st->'factures','[]'::jsonb))   x where x->>'adherentId' = adh_id), '[]'::jsonb),
    'espaces', '[]'::jsonb,
    'fournitures', '[]'::jsonb,
    'comptaMatiere', jsonb_build_object('pertes', '[]'::jsonb, 'documents', '[]'::jsonb),
    'users', '[]'::jsonb,
    'auditLog', '[]'::jsonb,
    'logo', st->'logo'
  );
end $$;
revoke execute on function public.stock_state() from public;
grant execute on function public.stock_state() to authenticated;

-- ---------- 5. Temps réel : synchro multi-appareils
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null;
end $$;

-- ---------- 6. Storage : bucket photos (lecture publique pour les
--               fiches QR, écriture réservée aux comptes connectés)
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

-- ---------- 7. Compte administrateur de l'application
-- Ajouté dans l'état JSONB (visible ensuite dans l'onglet Utilisateurs).
-- Ne fait rien si un compte existe déjà avec cet email.
do $$
declare
  admin_email  text := 'planet.aura.gbf@gmail.com';
  mot_de_passe text := 'CHANGEZ-MOI';  -- ⬅️ remplacez UNIQUEMENT ici (6 caractères minimum)
begin
  -- (comparaison en deux morceaux : reste valable même après un
  --  « tout remplacer » qui toucherait ce littéral)
  if mot_de_passe = 'CHANGEZ' || '-MOI' or length(mot_de_passe) < 6 then
    raise exception 'Remplacez CHANGEZ-MOI par votre mot de passe administrateur (6 caractères minimum), ligne « mot_de_passe », puis relancez le script.';
  end if;

  -- Enregistrement d'amorçage si le projet n'a encore aucun état.
  insert into public.app_state (key, value)
  values ('pa-stock-clean2', '{}'::jsonb)
  on conflict (key) do nothing;

  update public.app_state
     set value = jsonb_set(
           value, '{users}',
           coalesce(value->'users','[]'::jsonb) || jsonb_build_object(
             'id',    'U-ADMIN-1',
             'nom',   'Planet Aura',
             'email', admin_email,
             'mdp',   mot_de_passe,
             'role',  'admin',
             'permissions', jsonb_build_object(
               'entrees', true, 'sorties', true, 'references', true,
               'espaces', true, 'facturation', true, 'compta', true, 'grille', true),
             'creePar', 'Installation',
             'creeLe',  now()::text
           )
         ),
         updated_at = now()
   where key = 'pa-stock-clean2'
     and not exists (
       select 1 from jsonb_array_elements(coalesce(value->'users','[]'::jsonb)) u
        where lower(coalesce(u->>'email','')) = lower(admin_email)
     );
end $$;

-- ============================================================
-- Fin. Vérification rapide (facultative) : la requête ci-dessous
-- doit afficher une ligne avec votre email dans la liste.
--   select jsonb_pretty(value->'users') from public.app_state
--    where key = 'pa-stock-clean2';
-- ============================================================
