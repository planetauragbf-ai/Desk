-- ============================================================
-- Planet'Stock - CONNEXION FIABLE (un seul mot de passe, partout)
-- ============================================================
-- A coller UNE FOIS dans Supabase -> SQL Editor, puis Run.
--
-- 1) Cree la fonction de resynchronisation (stock_sync_auth) : a chaque
--    connexion, le mot de passe defini ci-dessous fait foi et est
--    reapplique cote Supabase. Plus de "mot de passe faux" en changeant
--    d'appareil.
-- 2) Definit le mot de passe des comptes emma@planet-aura.com et
--    planet.aura.gbf@gmail.com.
--
-- >>> REMPLACEZ VotreMotDePasse (une seule fois, ligne ci-dessous) <<<
-- Ensuite, connectez-vous avec ce mot de passe : il marchera sur tous
-- les navigateurs et appareils.
-- ============================================================

-- ---------- 1. Fonction de resynchronisation ----------
create extension if not exists pgcrypto with schema extensions;

create or replace function public.stock_sync_auth(p_email text, p_mdp text)
returns text language plpgsql security definer
set search_path = public, extensions as $$
declare cred_ok boolean; uid uuid;
begin
  if p_email is null or p_mdp is null or length(p_mdp) < 1 then return 'bad'; end if;
  select exists(
    select 1 from public.app_state s,
         jsonb_array_elements(coalesce(s.value->'users','[]'::jsonb)) u
     where s.key = 'pa-stock-clean2'
       and lower(coalesce(u->>'email','')) = lower(p_email)
       and coalesce(u->>'mdp','') = p_mdp
  ) into cred_ok;
  if not cred_ok then return 'bad'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email) limit 1;
  if uid is null then return 'nouser'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_mdp, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = uid;
  return 'synced';
end $$;
revoke execute on function public.stock_sync_auth(text,text) from public;
grant execute on function public.stock_sync_auth(text,text) to anon, authenticated;

-- ---------- 2. Mot de passe des comptes ----------
do $$
declare
  mot_de_passe text := 'VotreMotDePasse';   -- <<< A REMPLACER (6 caracteres min) <<<
  perms jsonb := jsonb_build_object('entrees',true,'sorties',true,'references',true,
    'espaces',true,'facturation',true,'compta',true,'grille',true,'journal',true,'adherent',true);
begin
  if length(mot_de_passe) < 6 or mot_de_passe = 'VotreMotDePasse' then
    raise exception 'Remplacez VotreMotDePasse par votre mot de passe (6 caracteres minimum), puis relancez.';
  end if;
  insert into public.app_state (key, value) values ('pa-stock-clean2', '{}'::jsonb)
  on conflict (key) do nothing;
  update public.app_state
     set value = jsonb_set(coalesce(value,'{}'::jsonb), '{users}', jsonb_build_array(
       jsonb_build_object('id','U-ADMIN-1','nom','Planet Aura','email','planet.aura.gbf@gmail.com','mdp',mot_de_passe,'role','admin','permissions',perms),
       jsonb_build_object('id','U-EMMA-1','nom','Emma','email','emma@planet-aura.com','mdp',mot_de_passe,'role','admin','permissions',perms)
     )),
     updated_at = now()
   where key = 'pa-stock-clean2';
end $$;

-- Verification : 2 comptes, et la fonction repond 'synced' ou 'nouser'.
select jsonb_array_length(value->'users') as comptes,
       (select string_agg(u->>'email', ', ') from jsonb_array_elements(value->'users') u) as emails
from public.app_state where key = 'pa-stock-clean2';
