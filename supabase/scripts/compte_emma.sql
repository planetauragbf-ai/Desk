-- ============================================================
-- Planet'Stock - Creer le compte emma@planet-aura.com (administrateur)
-- ============================================================
-- A coller dans Supabase -> SQL Editor, puis Run.
-- N'ecrase rien : ajoute Emma seulement si elle n'est pas deja presente.
--
-- Remplacez VotreMotDePasse par le mot de passe voulu (6 caracteres min).
-- IMPORTANT : au premier login sur le site, tapez emma@planet-aura.com
-- + EXACTEMENT ce meme mot de passe (il cree alors l'acces Supabase).
-- ============================================================
do $$
declare
  compte_email text := 'emma@planet-aura.com';
  mot_de_passe text := 'VotreMotDePasse';   -- a remplacer (6 caracteres minimum)
begin
  if length(mot_de_passe) < 6 or mot_de_passe = 'VotreMotDePasse' then
    raise exception 'Remplacez VotreMotDePasse par le mot de passe voulu (6 caracteres minimum), puis relancez.';
  end if;

  insert into public.app_state (key, value)
  values ('pa-stock-clean2', '{}'::jsonb)
  on conflict (key) do nothing;

  update public.app_state
     set value = jsonb_set(
           value, '{users}',
           coalesce(value->'users','[]'::jsonb) || jsonb_build_object(
             'id',    'U-EMMA-1',
             'nom',   'Emma',
             'email', compte_email,
             'mdp',   mot_de_passe,
             'role',  'admin',
             'permissions', jsonb_build_object(
               'entrees', true, 'sorties', true, 'references', true,
               'espaces', true, 'facturation', true, 'compta', true,
               'grille', true, 'journal', true, 'adherent', true),
             'creePar', 'Installation',
             'creeLe',  now()::text
           )
         ),
         updated_at = now()
   where key = 'pa-stock-clean2'
     and not exists (
       select 1 from jsonb_array_elements(coalesce(value->'users','[]'::jsonb)) u
        where lower(coalesce(u->>'email','')) = lower(compte_email)
     );
end $$;

-- Verification : doit lister emma@planet-aura.com.
select value->'users' from public.app_state where key = 'pa-stock-clean2';
