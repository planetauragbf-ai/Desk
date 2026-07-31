-- ============================================================
-- Planet'Desk — RATTRAPAGE
--   0009  dossiers de Documents et de Liens & outils (jamais exécutée)
--   0017  verrouillage de la sécurité (modèle « intermédiaire »)
--   0018  performance : index, intégrité des données, temps réel
--
-- À exécuter EN UNE SEULE FOIS : Supabase → SQL Editor → New query
-- → coller tout → Run. Les trois migrations sont reprises ci-dessous
-- dans le bon ordre.
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
