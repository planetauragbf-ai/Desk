-- ============================================================
-- Planet'Desk — Accès par application gérés par l'administrateur
-- À exécuter APRÈS 0007_stock.sql.
--
-- L'application s'appelle désormais Planet'Desk : un portail unique
-- (une seule connexion) qui héberge Planet'Projects (pilotage) et
-- Planet'Stock (stockage & picking). L'administrateur crée les
-- comptes et définit, personne par personne, ce que chacun peut
-- faire dans chaque application.
--
--  - profiles.stock_access : droits Planet'Stock du salarié, ex.
--      {"role":"admin"}
--      {"role":"logisticien","permissions":{"entrees":true,"sorties":true,"espaces":true}}
--      {"role":"adherent","adherent_id":"ADH001"}
--    null = comportement par défaut (correspondance par email avec
--    un utilisateur/adhérent du stock ; les admins du Desk sont
--    admins du stock).
-- ============================================================

alter table public.profiles
  add column if not exists stock_access jsonb;
