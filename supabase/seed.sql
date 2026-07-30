-- ============================================================
-- Planet AURA — Données d'exemple (optionnel)
-- À exécuter APRÈS 0001_init.sql et après avoir créé au moins
-- un utilisateur (l'objectif d'exemple n'a pas de référent).
-- ============================================================

insert into public.instances (id, name, parent_id, level) values
  ('11111111-1111-1111-1111-111111111101', 'Direction Planet AURA', null, 1),
  ('11111111-1111-1111-1111-111111111102', 'Communication & Communauté', '11111111-1111-1111-1111-111111111101', 2),
  ('11111111-1111-1111-1111-111111111103', 'Événements', '11111111-1111-1111-1111-111111111101', 2),
  ('11111111-1111-1111-1111-111111111104', 'Partenariats & Financements', '11111111-1111-1111-1111-111111111101', 2);

insert into public.objectives (id, title, expected_result, parent_id, instance_id, status, priority, start_date, due_date) values
  ('22222222-2222-2222-2222-222222222201',
   '[CAP 2027] Faire de Planet AURA une organisation de référence',
   'Structurer l''organisation, doubler la communauté active et pérenniser le financement d''ici fin 2027.',
   null, '11111111-1111-1111-1111-111111111101', 'en_cours', 'critique', current_date - 30, current_date + 500),
  ('22222222-2222-2222-2222-222222222202',
   'Lancer le nouveau site web de Planet AURA',
   'Site vitrine en ligne avec présentation, agenda des événements et formulaire d''adhésion.',
   '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'en_cours', 'haute', current_date - 15, current_date + 60),
  ('22222222-2222-2222-2222-222222222203',
   'Organiser l''événement annuel de la communauté',
   'Événement réunissant au moins 100 participants, budget équilibré, retours de satisfaction > 8/10.',
   '22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111103', 'non_initie', 'haute', current_date, current_date + 120);

insert into public.tasks (objective_id, title, status, priority, due_date) values
  ('22222222-2222-2222-2222-222222222202', 'Rédiger le cahier des charges du site', 'termine', 'haute', current_date - 7),
  ('22222222-2222-2222-2222-222222222202', 'Choisir l''hébergement et le nom de domaine', 'en_cours', 'moyenne', current_date + 7),
  ('22222222-2222-2222-2222-222222222202', 'Créer la maquette des pages principales', 'a_faire', 'haute', current_date + 21),
  ('22222222-2222-2222-2222-222222222203', 'Définir la date et le lieu', 'a_faire', 'critique', current_date + 14),
  ('22222222-2222-2222-2222-222222222203', 'Établir le budget prévisionnel', 'a_faire', 'haute', current_date + 21);

insert into public.workflow_templates (id, name, description) values
  ('33333333-3333-3333-3333-333333333301', 'Organisation d''un événement', 'Processus standard de préparation d''un événement communautaire.');

insert into public.workflow_steps (id, template_id, position, title) values
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', 1, 'Cadrage'),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333301', 2, 'Préparation'),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333301', 3, 'Jour J et bilan');

insert into public.workflow_actions (step_id, position, title) values
  ('44444444-4444-4444-4444-444444444401', 1, 'Définir objectif, date, lieu et budget'),
  ('44444444-4444-4444-4444-444444444401', 2, 'Constituer l''équipe organisatrice'),
  ('44444444-4444-4444-4444-444444444402', 1, 'Réserver le lieu et les prestataires'),
  ('44444444-4444-4444-4444-444444444402', 2, 'Lancer la communication et les inscriptions'),
  ('44444444-4444-4444-4444-444444444403', 1, 'Coordonner la logistique du jour J'),
  ('44444444-4444-4444-4444-444444444403', 2, 'Collecter les retours et rédiger le bilan');

insert into public.indicators (objective_id, name, unit, target_value, current_value, due_date) values
  ('22222222-2222-2222-2222-222222222202', 'Pages publiées', 'pages', 8, 2, current_date + 60),
  ('22222222-2222-2222-2222-222222222203', 'Participants inscrits', 'pers.', 100, 0, current_date + 110);

insert into public.decisions (objective_id, title, context, status) values
  ('22222222-2222-2222-2222-222222222202', 'Choix du CMS ou développement sur mesure', 'Comparer coût, autonomie de l''équipe et délais.', 'en_instruction');
