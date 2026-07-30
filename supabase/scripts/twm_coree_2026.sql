-- ============================================================
-- Planet’Projects — Opération « Tasty Wine Meetings Corée 2026 »
-- 1) Supprime l'objectif de test « Test - Tasty Corée »
-- 2) Crée l'objectif TWM Corée 2026 avec les 24 tâches du
--    fichier « Process TWM Corée 2026 » (phases, deadlines,
--    responsables et livrables dans la description).
-- Prérequis : migration 0004_tasks_clients.sql exécutée.
-- À exécuter dans Supabase → SQL Editor. Rejouable sans doublon.
-- ============================================================

-- 1) Suppression de l'objectif de test (les tâches, notes, documents,
--    décisions et indicateurs liés sont supprimés en cascade).
delete from public.objectives where title = 'Test - Tasty Corée';

-- Évite un doublon si le script est rejoué.
delete from public.objectives where title = 'Salon Tasty Wine Meetings Corée 2026';

-- 2) Création de l'objectif et de son plan d'actions.
with obj as (
  insert into public.objectives (title, expected_result, status, priority, start_date, due_date)
  values (
    'Salon Tasty Wine Meetings Corée 2026',
    'Acheminer les échantillons des domaines participants jusqu''au Daejeon Convention Center pour le salon Tasty Wine Meetings (4-6 novembre 2026) : collecte et contrôle des packing lists, consolidation à Castres, fret aérien vers ICN avant le 20/10, dédouanement et livraison par KUNG, puis facturation GL Events / Break Events et débrief.',
    'en_cours',
    'haute',
    date '2026-07-30',
    date '2026-12-04'
  )
  returning id
)
insert into public.tasks (objective_id, title, description, status, priority, due_date, workflow_group, assigned_kind, external_name)
select obj.id, t.title, t.description, t.status, t.priority, t.due_date, t.phase, t.assigned_kind, t.external_name
from obj,
(values
  ('Envoyer la documentation à GL Events',
   'Email avec lien Drive (label colis + packing list), fichier de suivi interne, rappel des exigences et grille enlèvements France. — Qui fait : Adam · Qui vérifie : Floriane · Livrable : Email GL Events + dossier Drive',
   'termine', 'moyenne', date '2026-07-30', '1. Lancement', 'salarie', null),
  ('Confirmer le nombre d''événements',
   'Un seul salon ou plusieurs comme l''an dernier ; si plusieurs, adapter les documents. — Qui fait : Adam · Livrable : Réponse écrite GL Events · Dépend de : n°1',
   'a_faire', 'moyenne', date '2026-08-07', '1. Lancement', 'salarie', null),
  ('Confirmer l''adresse consignee auprès de KUNG',
   'Divergence 87 vs 107 Expo-ro entre le CIPL et le PDF d''instructions ; faire trancher Frank Kim par écrit. — Qui fait : Adam · Qui vérifie : Emma · Livrable : Email de confirmation Frank Kim',
   'a_faire', 'haute', date '2026-08-07', '1. Lancement', 'salarie', null),
  ('Obtenir la liste des participants',
   'Liste par commercial GL Events (Thom, Denis, Vanessa) : domaine, contact, pays, nb bouteilles estimé. — Qui fait : GL Events (relance Adam) · Qui vérifie : Adam · Livrable : Liste participants dans le fichier de suivi · Dépend de : n°2',
   'a_faire', 'moyenne', date '2026-08-31', '1. Lancement', 'client', 'GL Events'),
  ('Diffuser les documents aux domaines',
   'GL Events transmet label colis + packing list vierge à chaque participant. — Qui fait : GL Events · Qui vérifie : Adam · Livrable : Label + packing list Excel · Dépend de : n°4',
   'a_faire', 'moyenne', date '2026-09-05', '2. Collecte', 'client', 'GL Events'),
  ('Collecter et relancer les packing lists',
   'Réception par email au format Excel uniquement (pas de PDF signé) ; relances hebdomadaires. — Qui fait : Emma · Qui vérifie : Adam · Livrable : Packing lists Excel par domaine · Dépend de : n°5',
   'a_faire', 'moyenne', date '2026-09-26', '2. Collecte', 'salarie', null),
  ('Contrôler la conformité des packing lists',
   'Mentions obligatoires : nom du vin, pays d''origine, couleur, degré, litrage, type, ingrédients vins sans alcool ; valeurs déclarées raisonnables, jamais nulles. — Qui fait : Emma · Qui vérifie : Adam · Livrable : Packing lists validées · Dépend de : n°6',
   'a_faire', 'moyenne', date '2026-09-29', '2. Collecte', 'salarie', null),
  ('Organiser les enlèvements France',
   'Selon grille tarifaire ; carton grand export validé avant départ, assurance optionnelle 3 %. — Qui fait : Emma · Qui vérifie : Adam · Livrable : Bons d''enlèvement + facturation · Dépend de : n°4',
   'a_faire', 'moyenne', date '2026-09-26', '2. Collecte', 'salarie', null),
  ('Pointer les réceptions à Castres',
   'Scan/pointage de chaque colis reçu, mise à jour du fichier de suivi, contrôle état et marquage. Au fil de l''eau. — Qui fait : Équipe entrepôt · Qui vérifie : Emma · Livrable : Fichier de suivi à jour · Dépend de : n°5',
   'a_faire', 'moyenne', null, '2. Collecte', 'salarie', null),
  ('Relance finale des retardataires',
   'Rappel deadline + surcoûts à la charge des participants en cas de retard. — Qui fait : Emma · Qui vérifie : Adam · Livrable : Emails de relance · Dépend de : n°9',
   'a_faire', 'moyenne', date '2026-09-28', '3. Consolidation', 'salarie', null),
  ('DEADLINE réception des échantillons',
   'Dernier jour de réception des colis chez Planet Aura Castres. — Qui fait : Domaines / GL Events · Qui vérifie : Emma · Livrable : Tous colis réceptionnés · Dépend de : n°10',
   'a_faire', 'critique', date '2026-10-02', '3. Consolidation', 'client', 'Domaines / GL Events'),
  ('Vérifier le marquage SAMPLE + labels caisses',
   'Chaque bouteille marquée SAMPLE, label Planet Aura et numérotation caisse N°/total sur chaque carton. — Qui fait : Équipe entrepôt · Qui vérifie : Emma · Livrable : Palette conforme · Dépend de : n°11',
   'a_faire', 'moyenne', date '2026-10-05', '3. Consolidation', 'salarie', null),
  ('Consolider la palette et mesurer',
   'Palettisation, pesée, dimensions, comptage caisses. — Qui fait : Équipe entrepôt · Qui vérifie : Emma · Livrable : Poids et dimensions définitifs · Dépend de : n°12',
   'a_faire', 'moyenne', date '2026-10-06', '3. Consolidation', 'salarie', null),
  ('Booker le fret aérien vers ICN',
   'Réservation vol cargo, arrivée ICN impérative avant le 20/10. — Qui fait : Emma · Qui vérifie : Adam · Livrable : Booking confirmation + AWB draft · Dépend de : n°13',
   'a_faire', 'haute', date '2026-10-06', '3. Consolidation', 'salarie', null),
  ('Compléter le CIPL global + Shipping Mark',
   'Lignes détaillées (dims, poids, description vins, HS code, quantités, disposal C, valeurs CIF), origine des marchandises. — Qui fait : Emma · Qui vérifie : Adam · Livrable : CIPL & Shipping Mark finalisés · Dépend de : n°13',
   'a_faire', 'moyenne', date '2026-10-07', '3. Consolidation', 'salarie', null),
  ('Faire valider le CIPL par KUNG avant départ',
   'Envoi à Frank Kim + Chan Jun Park pour validation douanière. — Qui fait : Emma · Qui vérifie : Frank Kim (KUNG) · Livrable : CIPL validé par écrit · Dépend de : n°15',
   'a_faire', 'haute', date '2026-10-08', '3. Consolidation', 'salarie', null),
  ('Expédier la palette',
   'Remise au transporteur aérien, AWB émis. — Qui fait : Emma · Qui vérifie : Adam · Livrable : MAWB/HAWB · Dépend de : n°14 et n°16',
   'a_faire', 'haute', date '2026-10-12', '4. Expédition', 'salarie', null),
  ('Communiquer les infos vol à KUNG',
   'Vol/carrier, n° MAWB/HAWB, nombre de colis, poids et dimensions + docs originaux. — Qui fait : Emma · Qui vérifie : Adam · Livrable : Email à Frank Kim · Dépend de : n°17',
   'a_faire', 'moyenne', date '2026-10-12', '4. Expédition', 'salarie', null),
  ('Suivre l''acheminement jusqu''à ICN',
   'Tracking jusqu''à l''arrivée, alerte immédiate en cas d''aléa. — Qui fait : Emma · Livrable : Confirmation arrivée ICN · Dépend de : n°17',
   'a_faire', 'moyenne', date '2026-10-20', '4. Expédition', 'salarie', null),
  ('Confirmer dédouanement et livraison venue',
   'KUNG : transport sous douane vers Daejeon, clearance, livraison Daejeon Convention Center. — Qui fait : KUNG (suivi Emma) · Qui vérifie : Adam · Livrable : Confirmation livraison · Dépend de : n°19',
   'a_faire', 'moyenne', date '2026-11-03', '4. Expédition', 'client', 'KUNG'),
  ('Salon Tasty Wine Meetings 2026',
   '4-6 novembre, Daejeon Convention Center. — Qui fait : GL Events · Dépend de : n°20',
   'a_faire', 'moyenne', date '2026-11-06', '5. Clôture'),
  ('Envoyer les documents export aux domaines',
   'Engagement pris : chaque domaine reçoit ses documents d''exportation après le salon. — Qui fait : Emma · Qui vérifie : Adam · Livrable : Docs export par domaine · Dépend de : n°21',
   'a_faire', 'moyenne', date '2026-11-20', '5. Clôture'),
  ('Facturer GL Events / Break Events',
   'Facture globale opération + enlèvements + assurances éventuelles. — Qui fait : Adam · Qui vérifie : Sébastien (compta) · Livrable : Facture émise · Dépend de : n°21',
   'a_faire', 'moyenne', date '2026-11-30', '5. Clôture'),
  ('Débriefer l''opération',
   'Retour d''expérience, points d''amélioration pour l''édition suivante. — Qui fait : Adam + Emma · Qui vérifie : Floriane · Livrable : Compte-rendu · Dépend de : n°23',
   'a_faire', 'moyenne', date '2026-12-04', '5. Clôture')
) as t(title, description, status, priority, due_date, phase, assigned_kind, external_name);
