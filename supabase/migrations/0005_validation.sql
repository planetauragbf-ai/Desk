-- ============================================================
-- Planet’Projects — Circuit de validation des tâches
-- À exécuter APRÈS 0004_tasks_clients.sql.
--  - validator_id : la personne désignée pour valider la tâche.
--    Quand l'exécutant termine, la tâche passe « en validation »
--    et le valideur est notifié ; il valide ou refuse.
-- ============================================================

alter table public.tasks
  add column if not exists validator_id uuid references public.profiles(id) on delete set null;
