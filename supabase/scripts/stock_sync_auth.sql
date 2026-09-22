-- ============================================================
-- Planet'Stock - Connexion fiable : le mot de passe applicatif fait foi
-- ============================================================
-- A coller UNE FOIS dans Supabase -> SQL Editor, puis Run.
--
-- Cree la fonction stock_sync_auth : a la connexion, si le couple
-- email + mot de passe correspond a un compte dans les donnees
-- (app_state.users), l'application resynchronise le mot de passe
-- d'authentification Supabase dessus. Plus de divergence entre
-- appareils : un seul mot de passe, defini dans Utilisateurs, marche
-- partout et se repare tout seul.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.stock_sync_auth(p_email text, p_mdp text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cred_ok boolean;
  uid uuid;
begin
  if p_email is null or p_mdp is null or length(p_mdp) < 1 then
    return 'bad';
  end if;

  -- 1. L'identifiant existe-t-il dans les donnees de l'application ?
  select exists(
    select 1 from public.app_state s,
         jsonb_array_elements(coalesce(s.value->'users','[]'::jsonb)) u
     where s.key = 'pa-stock-clean2'
       and lower(coalesce(u->>'email','')) = lower(p_email)
       and coalesce(u->>'mdp','') = p_mdp
  ) into cred_ok;
  if not cred_ok then
    return 'bad';
  end if;

  -- 2. Le compte d'authentification existe-t-il deja ?
  select id into uid from auth.users where lower(email) = lower(p_email) limit 1;
  if uid is null then
    return 'nouser';   -- l'application le creera (signUp)
  end if;

  -- 3. Resynchroniser le mot de passe d'authentification sur l'applicatif.
  update auth.users
     set encrypted_password = extensions.crypt(p_mdp, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = uid;
  return 'synced';
end $$;

revoke execute on function public.stock_sync_auth(text,text) from public;
grant execute on function public.stock_sync_auth(text,text) to anon, authenticated;
