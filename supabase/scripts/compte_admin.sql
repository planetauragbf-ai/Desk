-- ============================================================
-- Planet'Stock - Creation du compte administrateur (bloc court)
-- ============================================================
-- A utiliser quand le grand script installation_stock_seul.sql a
-- deja ete execute (fonction stock_state deja creee) mais que le
-- collage a ete coupe avant la creation du compte admin.
--
-- Remplacez VotreMotDePasse par le mot de passe de votre choix
-- (6 caracteres minimum), puis executez dans le SQL Editor.
-- ============================================================
do $$
declare
  admin_email  text := 'planet.aura.gbf@gmail.com';
  mot_de_passe text := 'VotreMotDePasse';   -- a remplacer (6 caracteres minimum)
begin
  if length(mot_de_passe) < 6 or mot_de_passe = 'VotreMotDePasse' then
    raise exception 'Remplacez VotreMotDePasse par votre mot de passe (6 caracteres minimum), puis relancez.';
  end if;

  insert into public.app_state (key, value)
  values ('pa-stock-clean2', '{}'::jsonb)
  on conflict (key) do nothing;

  update public.app_state
     set value = jsonb_set(
           value, '{users}',
           coalesce(value->'users','[]'::jsonb) || jsonb_build_object(
             'id',    'U-ADMIN-1',
             'nom',   'Planet Aura',
             'email', admin_email,
             'mdp',   mot_de_passe,
             'role',  'admin',
             'permissions', jsonb_build_object(
               'entrees', true, 'sorties', true, 'references', true,
               'espaces', true, 'facturation', true, 'compta', true, 'grille', true),
             'creePar', 'Installation',
             'creeLe',  now()::text
           )
         ),
         updated_at = now()
   where key = 'pa-stock-clean2'
     and not exists (
       select 1 from jsonb_array_elements(coalesce(value->'users','[]'::jsonb)) u
        where lower(coalesce(u->>'email','')) = lower(admin_email)
     );
end $$;

-- Verification : doit afficher votre email.
select value->'users' from public.app_state where key = 'pa-stock-clean2';
