-- ============================================================
-- Planet'Desk — RATTRAPAGE
--   0009  dossiers de Documents et de Liens & outils (jamais exécutée)
--   0017  verrouillage de la sécurité (modèle « intermédiaire »)
--   0018  performance : index, intégrité des données, temps réel
--   0019  correctif : récursion des politiques du chat
--   0020  chat : compteurs de messages non lus
--   0021  Planet'Claim : vocabulaire du classeur + transporteurs
--   0022  correctif : récursion des politiques de profiles
--
-- À exécuter EN UNE SEULE FOIS : Supabase → SQL Editor → New query
-- → coller tout → Run. Les migrations sont reprises ci-dessous dans
-- le bon ordre.
--
-- Le script est REJOUABLE : le relancer ne casse rien et ne touche
-- à aucune donnée existante.
--
-- Fichier généré par supabase/scripts/generer.sh — ne pas modifier ici.
-- ============================================================



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


-- ############################################################
-- ### MIGRATION 0020_chat_lecture
-- ############################################################

-- ============================================================
-- Planet'Desk — Chat : messages non lus
-- À exécuter APRÈS 0019_chat_recursion.sql. Script rejouable.
--
-- Jusqu'ici rien n'indiquait qu'un collègue avait répondu : il fallait
-- ouvrir chaque conversation pour le découvrir.
--
--  • chat_reads : date de dernière lecture, par personne et par
--    conversation (une ligne par couple, mise à jour à l'ouverture) ;
--  • chat_unread() : pour l'appelant, le nombre de messages non lus et
--    la date du dernier message, conversation par conversation. Une
--    seule requête au lieu d'une par conversation.
-- ============================================================

create table if not exists public.chat_reads (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  channel_id   uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (profile_id, channel_id)
);

alter table public.chat_reads enable row level security;

-- Chacun ne gère que ses propres marque-pages de lecture.
drop policy if exists "chat_reads_own" on public.chat_reads;
create policy "chat_reads_own" on public.chat_reads for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

/**
 * Messages non lus de l'appelant, par conversation.
 * Ses propres messages ne comptent jamais comme non lus.
 */
create or replace function public.chat_unread()
returns table (channel_id uuid, unread int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with moi as (select auth.uid() as id),
  -- can_see_channel() n'est évalué qu'une fois par conversation.
  visibles as (
    select c.id from public.channels c where public.can_see_channel(c.id)
  )
  select m.channel_id, count(*)::int, max(m.created_at)
  from public.messages m
  join visibles v on v.id = m.channel_id
  left join public.chat_reads r
    on r.channel_id = m.channel_id and r.profile_id = (select id from moi)
  where m.author_id is distinct from (select id from moi)
    and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by m.channel_id;
$$;

/** Marque une conversation comme lue jusqu'à maintenant. */
create or replace function public.chat_mark_read(cid uuid)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.chat_reads (profile_id, channel_id, last_read_at)
  values (auth.uid(), cid, now())
  on conflict (profile_id, channel_id) do update set last_read_at = now();
$$;

grant execute on function public.chat_unread(), public.chat_mark_read(uuid) to authenticated;

create index if not exists chat_reads_profile_idx on public.chat_reads (profile_id);
create index if not exists messages_author_idx on public.messages (author_id);


-- ############################################################
-- ### MIGRATION 0021_claim_vocabulaire
-- ############################################################

-- ============================================================
-- Planet'Claim — Vocabulaire aligné sur le suivi Planet Aura
-- À exécuter APRÈS 0020_chat_lecture.sql. Script rejouable.
--
-- Le module utilisait ses propres codes (« nouveau », « casse »,
-- « moyenne »). Le classeur de suivi, lui, a son vocabulaire — dix
-- statuts, neuf types, trois niveaux d'urgence, listés dans son onglet
-- « Listes ». Importer les dossiers sans aligner les deux aurait
-- déformé les données à l'entrée.
--
-- Ce sont donc les valeurs du classeur qui font foi, et les dossiers
-- déjà saisis dans l'application sont convertis.
-- ============================================================

-- ---------- 1. Les anciennes contraintes doivent tomber d'abord -------
alter table public.claims drop constraint if exists claims_status_chk;
alter table public.claims drop constraint if exists claims_category_chk;
alter table public.claims drop constraint if exists claims_priority_chk;

-- ---------- 2. Conversion des dossiers déjà saisis --------------------
update public.claims set status = case status
  when 'nouveau'              then 'Nouveau'
  when 'en_cours'             then 'En instruction'
  when 'attente_transporteur' then 'Documents en cours'
  when 'attente_assurance'    then 'Transmis Coste Fermon'
  when 'attente_client'       then 'Documents en cours'
  when 'accepte'              then 'Accord assureur'
  when 'refuse'               then 'Refusé / Sans suite'
  when 'clos'                 then 'Clôturé'
  else status end
where status in ('nouveau','en_cours','attente_transporteur','attente_assurance',
                 'attente_client','accepte','refuse','clos');

update public.claims set category = case category
  when 'casse'            then 'Casse partielle'
  when 'perte'            then 'Perte'
  when 'vol'              then 'Vol'
  when 'temperature'      then 'Altération thermique'
  when 'erreur_livraison' then 'Refus livraison'
  when 'retard'           then 'Autre'
  when 'facturation'      then 'Autre'
  when 'autre'            then 'Autre'
  else category end
where category in ('casse','perte','vol','temperature','erreur_livraison',
                   'retard','facturation','autre');

update public.claims set priority = case priority
  when 'basse'    then 'Normal'
  when 'moyenne'  then 'Normal'
  when 'haute'    then 'Important'
  when 'critique' then 'Critique'
  else priority end
where priority in ('basse','moyenne','haute','critique');

-- Filet : toute valeur restée inconnue retombe sur la valeur par défaut,
-- sinon la contrainte posée ensuite ne pourrait pas être validée.
update public.claims set status = 'Nouveau'
where status not in ('Nouveau','Documents en cours','Transmis Coste Fermon','En instruction',
                     'Expertise en cours','Accord assureur','Indemnisé','Clôturé',
                     'Refusé / Sans suite','Non - Assuré');
update public.claims set category = 'Autre'
where category not in ('Casse partielle','Casse totale','Coulage / fuite','Perte','Vol',
                       'Refus livraison','Altération thermique','Étiquette tachée','Autre');
update public.claims set priority = 'Normal'
where priority not in ('Normal','Important','Critique');

-- ---------- 3. Nouvelles valeurs par défaut et contraintes ------------
alter table public.claims alter column status   set default 'Nouveau';
alter table public.claims alter column category set default 'Casse partielle';
alter table public.claims alter column priority set default 'Normal';

alter table public.claims add constraint claims_status_chk check (status in (
  'Nouveau','Documents en cours','Transmis Coste Fermon','En instruction','Expertise en cours',
  'Accord assureur','Indemnisé','Clôturé','Refusé / Sans suite','Non - Assuré'));

alter table public.claims add constraint claims_category_chk check (category in (
  'Casse partielle','Casse totale','Coulage / fuite','Perte','Vol','Refus livraison',
  'Altération thermique','Étiquette tachée','Autre'));

alter table public.claims add constraint claims_priority_chk check (priority in (
  'Normal','Important','Critique'));

-- ---------- 4. Annuaire des transporteurs -----------------------------
-- Le classeur porte un onglet « Transporteurs » : contacts du service
-- litiges et délai maximum de recours. C'est ce délai qui déclenche les
-- relances, il a sa place dans l'application plutôt que dans un fichier
-- à part.
create table if not exists public.carriers (
  name            text primary key,
  phone           text not null default '',
  email           text not null default '',
  address         text not null default '',
  tracking_url    text not null default '',
  claim_url       text not null default '',
  delai_recours   text not null default '',
  notes           text not null default ''
);

alter table public.carriers enable row level security;
drop policy if exists "carriers_read" on public.carriers;
create policy "carriers_read" on public.carriers for select to authenticated using (true);
drop policy if exists "carriers_admin_write" on public.carriers;
create policy "carriers_admin_write" on public.carriers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.carriers (name, phone, email, address, tracking_url, claim_url, delai_recours, notes) values
  ('UPS', '+33 821 233 877', 'frcustomersupport@ups.com', 'UPS France – Aéroport CDG, BP 70535, 95721 Roissy CDG', 'https://www.ups.com/track', 'https://www.ups.com/fr/fr/support/file-a-claim.page', '9 mois (UPS) / 3 j (FR)', ''),
  ('FedEx', '+33 1 70 95 92 25', 'frcustomerservice@fedex.com', 'FedEx Express France – Roissy CDG', 'https://www.fedex.com/fr-fr/tracking.html', 'https://www.fedex.com/fr-fr/customer-support/claims.html', '21 jours (CMR)', ''),
  ('Chronopost', '3634 (FR)', 'service.clients@chronopost.fr', 'Chronopost SA – 3 Bd Romain Rolland, 92120 Montrouge', 'https://www.chronopost.fr/fr/suivi-colis', 'https://www.chronopost.fr/fr/contactez-nous', '3 jours ouvrés', ''),
  ('DHL Express', '+33 1 55 85 75 75', 'expressfrance@dhl.com', 'DHL Express France – 241 Rue de la Belle Étoile, 95701 Roissy CDG', 'https://www.dhl.com/fr-fr/home/tracking.html', 'https://www.dhl.com/fr-fr/home/contactez-nous.html', '3 jours ouvrés', ''),
  ('TNT', '+33 825 033 033', 'customer.servicefrance@tnt.fr', 'TNT Express France – 58 Av. Leclerc, 69007 Lyon', 'https://www.tnt.com/express/fr_fr/site/shipping-tools/tracking.html', 'https://www.tnt.com/express/fr_fr/site/contact-us/forms/customer-care.html', '21 jours (CMR)', ''),
  ('DPD', '+33 9 70 80 85 86', 'service.clients@dpd.fr', 'DPD France – 9 Rue Maurice Mallet, 92130 Issy-les-Moulineaux', 'https://www.dpd.com/fr/fr/recevoir/suivre-mon-colis/', 'https://www.dpd.com/fr/fr/contact/', '3 jours ouvrés', ''),
  ('GLS', '+33 1 78 36 13 00', 'info-fr@gls-france.com', 'GLS France – 14 Rue Michael Faraday, 77700 Magny-le-Hongre', 'https://gls-group.com/FR/fr/suivi-colis', 'https://gls-group.com/FR/fr/nous-contacter', '3 jours ouvrés', ''),
  ('Geodis', '+33 1 56 76 26 00', 'contact@geodis.com', 'Geodis – 26 Quai Charles Pasqua, 92300 Levallois-Perret', 'https://www.geodis.com/fr', 'https://www.geodis.com/fr/nous-contacter', 'Variable selon contrat', ''),
  ('Schenker', '+33 1 56 24 80 00', 'info.fr@dbschenker.com', 'DB Schenker France – 1 Rue Berthelot, 93100 Montreuil', 'https://eschenker.dbschenker.com/', 'https://www.dbschenker.com/fr-fr/nous-contacter', 'Variable selon contrat', ''),
  ('Autre', '', '', '', '', '', '', 'À compléter au cas par cas')
on conflict (name) do update set
  phone = excluded.phone, email = excluded.email, address = excluded.address,
  tracking_url = excluded.tracking_url, claim_url = excluded.claim_url,
  delai_recours = excluded.delai_recours, notes = excluded.notes;

-- Weship, ajouté à votre demande, ne figure pas au classeur.
insert into public.carriers (name) values ('Weship') on conflict (name) do nothing;


-- ############################################################
-- ### MIGRATION 0022_profils_recursion
-- ############################################################

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
