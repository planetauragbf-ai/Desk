-- ============================================================
-- Planet'Stock - Remise a zero des donnees (comptes conserves)
-- ============================================================
-- IRREVERSIBLE : vide references, adherents, entrees, sorties,
-- releves, espaces, compta matiere et journal. CONSERVE les
-- comptes (liste users), le logo et la configuration fournitures.
--
-- A coller dans Supabase -> SQL Editor, puis Run.
-- ============================================================
update public.app_state
   set value = jsonb_build_object(
     'adherents',    '[]'::jsonb,
     'references',   '[]'::jsonb,
     'entrees',      '[]'::jsonb,
     'sorties',      '[]'::jsonb,
     'factures',     '[]'::jsonb,
     'espaces',      '[]'::jsonb,
     'fournitures',  coalesce(value->'fournitures', '[]'::jsonb),
     'comptaMatiere', jsonb_build_object('pertes','[]'::jsonb,'documents','[]'::jsonb),
     'auditLog',     '[]'::jsonb,
     'journal',      '[]'::jsonb,
     'nextEntreeId', 1,
     'nextSortieId', 1,
     'nextFactureId', 1,
     'users',        coalesce(value->'users', '[]'::jsonb),
     'logo',         value->'logo'
   ),
   updated_at = now()
 where key = 'pa-stock-clean2';

-- Verification : doit afficher 0 partout, sauf vos comptes.
select
  jsonb_array_length(value->'references')  as references,
  jsonb_array_length(value->'adherents')   as adherents,
  jsonb_array_length(value->'sorties')     as sorties,
  jsonb_array_length(value->'users')       as comptes_conserves
from public.app_state where key = 'pa-stock-clean2';
