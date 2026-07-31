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
