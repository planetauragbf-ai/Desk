-- ============================================================
-- Planet'Stock - Reparer les comptes (liste users vide)
-- ============================================================
-- Remet emma@planet-aura.com ET planet.aura.gbf@gmail.com comme
-- administrateurs dans l'etat applicatif. A utiliser quand la liste
-- des comptes est vide (0 compte). Ne touche pas aux autres donnees.
--
-- Le mot de passe reel de connexion est celui defini au premier login
-- sur le site (Supabase Auth) ; la valeur mdp ci-dessous n'est qu'un
-- repli local et n'a pas besoin d'etre memorisee.
-- ============================================================
update public.app_state
   set value = jsonb_set(
     coalesce(value, '{}'::jsonb), '{users}',
     jsonb_build_array(
       jsonb_build_object(
         'id','U-ADMIN-1','nom','Planet Aura','email','planet.aura.gbf@gmail.com',
         'mdp','a-definir-au-login','role','admin',
         'permissions', jsonb_build_object('entrees',true,'sorties',true,'references',true,
           'espaces',true,'facturation',true,'compta',true,'grille',true,'journal',true,'adherent',true)),
       jsonb_build_object(
         'id','U-EMMA-1','nom','Emma','email','emma@planet-aura.com',
         'mdp','a-definir-au-login','role','admin',
         'permissions', jsonb_build_object('entrees',true,'sorties',true,'references',true,
           'espaces',true,'facturation',true,'compta',true,'grille',true,'journal',true,'adherent',true))
     )
   ),
   updated_at = now()
 where key = 'pa-stock-clean2';

-- Verification : doit afficher 2 comptes et les deux emails.
select jsonb_array_length(value->'users') as comptes,
       (select string_agg(u->>'email', ', ') from jsonb_array_elements(value->'users') u) as emails
from public.app_state where key = 'pa-stock-clean2';
