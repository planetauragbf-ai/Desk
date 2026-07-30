-- ============================================================
-- Planet'Desk — REMISE À ZÉRO des données
-- ⚠️ IRRÉVERSIBLE : vide toutes les données métier des deux
-- applications (Planet'Projects et Planet'Stock) pour repartir
-- d'une base propre. Les COMPTES (profiles + Supabase Auth) et le
-- LOGO personnalisé sont conservés.
--
-- À exécuter dans Supabase → SQL Editor, en toute connaissance
-- de cause (faites un export au préalable si besoin).
-- ============================================================

-- ---------- Planet'Projects : pilotage
truncate table
  public.objective_members,
  public.indicators,
  public.decisions,
  public.documents,
  public.notes,
  public.workflow_actions,
  public.workflow_steps,
  public.workflow_templates,
  public.tasks,
  public.objectives,
  public.notifications
  cascade;

-- ---------- Organigramme (décommentez pour vider aussi les instances)
-- truncate table public.instances cascade;
-- update public.profiles set instance_id = null;

-- ---------- Planet'Desk : chat et liens
truncate table public.messages cascade;
delete from public.channels where name <> 'Général';
delete from public.links;

-- ---------- Planet'Stock : état applicatif
delete from public.app_state;

-- ---------- Fichiers déposés (bucket documents) et photos du stock
-- Les objets Storage se suppriment depuis le dashboard :
-- Storage → documents / photos → sélectionner tout → Delete.

-- ---------- Pour repartir avec des accès propres (optionnel)
-- update public.profiles set modules = null, stock_access = null where role <> 'admin';
