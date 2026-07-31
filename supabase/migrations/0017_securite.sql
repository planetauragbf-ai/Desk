-- ============================================================
-- Planet'Desk — Verrouillage de la sécurité (modèle « intermédiaire »)
-- À exécuter APRÈS 0016_claim_v2.sql.
--
-- Principe retenu :
--   • les SALARIÉS internes voient les données de travail entre eux
--     (transparence assumée) ;
--   • les ACTIONS SENSIBLES sont verrouillées côté base, plus seulement
--     à l'écran : gestion des accès, validation des congés, journal ;
--   • les ADHÉRENTS (clients externes) sont strictement cloisonnés :
--     ils n'accèdent qu'à leurs propres données de stock ;
--   • les CONVERSATIONS PRIVÉES ne sont lisibles que de leurs membres,
--     administrateurs compris.
-- ============================================================

-- ---------- Fonctions d'aide -------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_compta()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_compta, false));
$$;

/** Salarié interne = tout compte qui n'est pas un adhérent (client externe). */
create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.stock_access->>'role', '') <> 'adherent'
  );
$$;

-- ---------- 1. Escalade de privilèges ----------------------------------
-- Sans ce garde-fou, un salarié pouvait se passer administrateur, s'ouvrir
-- tous les modules ou se réactiver lui-même par une simple requête API.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Auto-réparation d'un profil supprimé : toujours en simple membre.
    new.role := 'membre';
    new.modules := null;
    new.perms := null;
    new.stock_access := null;
    new.disabled := false;
    new.is_compta := false;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.modules is distinct from old.modules
     or new.perms is distinct from old.perms
     or new.stock_access is distinct from old.stock_access
     or new.disabled is distinct from old.disabled
     or new.is_compta is distinct from old.is_compta
     or new.cp_droits is distinct from old.cp_droits
  then
    raise exception 'Ces droits ne peuvent être modifiés que par un administrateur';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_privileges_trg on public.profiles;
create trigger guard_profile_privileges_trg
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Annuaire : réservé aux salariés internes (un adhérent ne voit que lui-même).
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_internal());

-- ---------- 2. Conversations privées -----------------------------------
-- Le filtrage n'existait que côté navigateur : tous les messages privés
-- de l'entreprise étaient lisibles par n'importe quel compte.
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = messages.channel_id
        and coalesce(c.private, false) = false
        and coalesce(c.dm, false) = false
        and public.is_internal()
    )
    or exists (
      select 1 from public.channel_members m
      where m.channel_id = messages.channel_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.channels c
      where c.id = messages.channel_id and c.created_by = auth.uid()
    )
    -- Canal privé (hors conversation directe) : visible des administrateurs.
    or (
      public.is_admin()
      and exists (select 1 from public.channels c where c.id = messages.channel_id and coalesce(c.dm, false) = false)
    )
  );

drop policy if exists "channels_all" on public.channels;
create policy "channels_select" on public.channels for select to authenticated
  using (
    (coalesce(private, false) = false and coalesce(dm, false) = false and public.is_internal())
    or created_by = auth.uid()
    or exists (select 1 from public.channel_members m where m.channel_id = channels.id and m.profile_id = auth.uid())
    or (public.is_admin() and coalesce(dm, false) = false)
  );
create policy "channels_insert" on public.channels for insert to authenticated
  with check (public.is_internal());
create policy "channels_update" on public.channels for update to authenticated
  using (created_by = auth.uid() or (public.is_admin() and coalesce(dm, false) = false));
create policy "channels_delete" on public.channels for delete to authenticated
  using (created_by = auth.uid() or (public.is_admin() and coalesce(dm, false) = false));

drop policy if exists "channel_members_all" on public.channel_members;
create policy "channel_members_select" on public.channel_members for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.channel_members m where m.channel_id = channel_members.channel_id and m.profile_id = auth.uid())
    or exists (select 1 from public.channels c where c.id = channel_members.channel_id and (c.created_by = auth.uid() or coalesce(c.dm, false) = false))
  );
create policy "channel_members_write" on public.channel_members for all to authenticated
  using (
    exists (select 1 from public.channels c where c.id = channel_members.channel_id and c.created_by = auth.uid())
    or public.is_admin()
    or profile_id = auth.uid()
  )
  with check (public.is_internal());

-- ---------- 3. Congés et heures : validation réservée -------------------
-- Chacun pouvait valider sa propre demande ou supprimer celle d'un collègue.
drop policy if exists "leaves_all" on public.leaves;
create policy "leaves_select" on public.leaves for select to authenticated
  using (public.is_internal());
create policy "leaves_insert" on public.leaves for insert to authenticated
  with check (
    public.is_internal()
    and (
      -- Une demande se dépose pour soi, en attente ; admin/compta saisissent pour autrui.
      (profile_id = auth.uid() and status = 'en_attente')
      or public.is_admin() or public.is_compta()
    )
  );
create policy "leaves_update" on public.leaves for update to authenticated
  using (public.is_admin() or public.is_compta());
create policy "leaves_delete" on public.leaves for delete to authenticated
  using (
    public.is_admin() or public.is_compta()
    or (profile_id = auth.uid() and status = 'en_attente')
  );

drop policy if exists "time_entries_all" on public.time_entries;
create policy "time_entries_select" on public.time_entries for select to authenticated
  using (public.is_internal());
create policy "time_entries_write" on public.time_entries for all to authenticated
  using (profile_id = auth.uid() or public.is_admin() or public.is_compta())
  with check (public.is_internal() and (profile_id = auth.uid() or public.is_admin() or public.is_compta()));

-- ---------- 4. Données de travail : salariés internes uniquement --------
drop policy if exists "claims_all" on public.claims;
create policy "claims_all" on public.claims for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

drop policy if exists "claim_events_all" on public.claim_events;
create policy "claim_events_all" on public.claim_events for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

drop policy if exists "objectives_all" on public.objectives;
create policy "objectives_all" on public.objectives for all to authenticated
  using (public.is_internal()) with check (public.is_internal());
drop policy if exists "tasks_all" on public.tasks;
create policy "tasks_all" on public.tasks for all to authenticated
  using (public.is_internal()) with check (public.is_internal());
drop policy if exists "notes_all" on public.notes;
create policy "notes_all" on public.notes for all to authenticated
  using (public.is_internal()) with check (public.is_internal());
drop policy if exists "documents_all" on public.documents;
create policy "documents_all" on public.documents for all to authenticated
  using (public.is_internal()) with check (public.is_internal());
drop policy if exists "decisions_all" on public.decisions;
create policy "decisions_all" on public.decisions for all to authenticated
  using (public.is_internal()) with check (public.is_internal());
drop policy if exists "indicators_all" on public.indicators;
create policy "indicators_all" on public.indicators for all to authenticated
  using (public.is_internal()) with check (public.is_internal());
drop policy if exists "links_all" on public.links;
create policy "links_all" on public.links for all to authenticated
  using (public.is_internal()) with check (public.is_internal());
drop policy if exists "folders_all" on public.folders;
create policy "folders_all" on public.folders for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

-- ---------- 5. Journal d'activité infalsifiable -------------------------
drop policy if exists "audit_insert" on public.audit_log;
create policy "audit_insert" on public.audit_log for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- 6. Notifications : plus d'usurpation ------------------------
-- On ne peut notifier que soi-même ou un collègue interne, jamais au nom
-- de quelqu'un d'autre (le message reste attribué à son émetteur réel).
drop policy if exists "notifications_write" on public.notifications;
create policy "notifications_write" on public.notifications for insert to authenticated
  with check (public.is_internal());

-- ---------- 7. Planet'Stock : cloisonnement des adhérents ---------------
-- L'état du stock est un JSON monolithique : impossible à découper par RLS.
-- Les adhérents passent donc par une fonction qui ne leur renvoie QUE
-- leurs propres données ; l'accès direct à la table leur est fermé.
drop policy if exists "app_state_auth" on public.app_state;
create policy "app_state_internal" on public.app_state for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

create or replace function public.stock_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  st jsonb;
  me public.profiles%rowtype;
  adh_id text;
  filtre jsonb;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then
    raise exception 'Authentification requise';
  end if;

  select value into st from public.app_state where key = 'pa-stock-clean2';
  if st is null then return null; end if;

  -- Salarié interne : état complet.
  if coalesce(me.stock_access->>'role', '') <> 'adherent' then
    return st;
  end if;

  -- Adhérent : identification de sa fiche (id explicite, sinon email).
  adh_id := me.stock_access->>'adherent_id';
  if adh_id is null or adh_id = '' then
    select a->>'id' into adh_id
      from jsonb_array_elements(coalesce(st->'adherents', '[]'::jsonb)) a
     where lower(coalesce(a->>'email', '')) = lower(coalesce(me.email, ''))
     limit 1;
  end if;

  filtre := jsonb_build_object(
    'adherents', coalesce((select jsonb_agg(a) from jsonb_array_elements(coalesce(st->'adherents','[]'::jsonb)) a where a->>'id' = adh_id), '[]'::jsonb),
    'references', coalesce((select jsonb_agg(r) from jsonb_array_elements(coalesce(st->'references','[]'::jsonb)) r where r->>'adherentId' = adh_id), '[]'::jsonb),
    'entrees', coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(st->'entrees','[]'::jsonb)) e where e->>'adherentId' = adh_id), '[]'::jsonb),
    'sorties', coalesce((select jsonb_agg(s) from jsonb_array_elements(coalesce(st->'sorties','[]'::jsonb)) s where s->>'adherentId' = adh_id), '[]'::jsonb),
    'factures', coalesce((select jsonb_agg(f) from jsonb_array_elements(coalesce(st->'factures','[]'::jsonb)) f where f->>'adherentId' = adh_id), '[]'::jsonb),
    'espaces', '[]'::jsonb,
    'fournitures', '[]'::jsonb,
    'comptaMatiere', jsonb_build_object('pertes', '[]'::jsonb, 'documents', '[]'::jsonb),
    'users', '[]'::jsonb,
    'auditLog', '[]'::jsonb,
    'logo', st->'logo'
  );
  return filtre;
end $$;

grant execute on function public.stock_state() to authenticated;

-- ---------- 8. Clé API Ship24 hors de portée du public ------------------
-- app_settings est lisible par les visiteurs anonymes (logos) : les secrets
-- n'y ont pas leur place.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

drop policy if exists "app_secrets_admin" on public.app_secrets;
create policy "app_secrets_admin" on public.app_secrets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Reprise de la clé éventuellement déjà saisie, puis effacement du réglage public.
insert into public.app_secrets (key, value)
  select 'ship24_api_key', value from public.app_settings where key = 'ship24_api_key'
  on conflict (key) do update set value = excluded.value;
delete from public.app_settings where key = 'ship24_api_key';
