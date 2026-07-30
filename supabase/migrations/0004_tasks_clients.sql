-- ============================================================
-- Planet’Projects — Tâches : intervenant salarié ou client
-- À exécuter APRÈS 0003_branding.sql.
--  - assigned_kind : 'salarie' (référent interne via assignee_id)
--    ou 'client' (intervenant externe nommé dans external_name)
-- ============================================================

alter table public.tasks
  add column if not exists assigned_kind text not null default 'salarie',
  add column if not exists external_name text;
