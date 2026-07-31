-- ============================================================
-- Planet'Desk — Correctif : récursion infinie dans les politiques du chat
-- À exécuter APRÈS 0018_performance.sql. Script rejouable.
--
-- SYMPTÔME : depuis 0017, impossible de créer un canal de discussion
-- (ni d'en lire un). PostgreSQL renvoyait :
--   « infinite recursion detected in policy for relation "channels" »
--
-- CAUSE : la politique de lecture de `channels` interrogeait
-- `channel_members`, dont la politique de lecture interrogeait
-- `channels`. Chaque table attendait l'autre.
--
-- CORRECTIF : les questions « suis-je membre ? », « ai-je le droit de
-- voir cette conversation ? » et « en suis-je l'auteur ? » passent par
-- des fonctions `security definer`. Elles lisent la table directement,
-- sans repasser par les politiques — la boucle est cassée. Au passage
-- les trois politiques deviennent beaucoup plus courtes, et la règle de
-- visibilité n'est plus écrite en trois exemplaires qui pouvaient
-- diverger.
-- ============================================================

-- ---------- Fonctions de contexte du chat -------------------------------
/** Membre de la conversation ? Lecture hors RLS : c'est ce qui casse la
    récursion entre channels et channel_members. */
create or replace function public.is_channel_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members m
    where m.channel_id = cid and m.profile_id = auth.uid()
  );
$$;

/** Droit de voir la conversation — donc aussi ses messages et ses membres.
    Règle unique :
      • canal ouvert (ni privé ni conversation à deux) : tous les salariés ;
      • conversation privée ou à deux : son auteur et ses membres ;
      • un administrateur voit les canaux, jamais les conversations à deux. */
create or replace function public.can_see_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid
      and (
        (coalesce(c.private, false) = false and coalesce(c.dm, false) = false and public.is_internal())
        or c.created_by = auth.uid()
        or (public.is_admin() and coalesce(c.dm, false) = false)
        or public.is_channel_member(c.id)
      )
  );
$$;

/** Auteur de la conversation (peut gérer ses membres). */
create or replace function public.owns_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channels c where c.id = cid and c.created_by = auth.uid());
$$;

grant execute on function public.is_channel_member(uuid), public.can_see_channel(uuid),
                         public.owns_channel(uuid) to authenticated;

-- ---------- Politiques du chat, sans récursion --------------------------
drop policy if exists "channels_select" on public.channels;
create policy "channels_select" on public.channels for select to authenticated
  using (
    (coalesce(private, false) = false and coalesce(dm, false) = false and (select public.is_internal()))
    or created_by = (select auth.uid())
    or ((select public.is_admin()) and coalesce(dm, false) = false)
    or public.is_channel_member(id)
  );

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated
  using (public.can_see_channel(channel_id));

drop policy if exists "channel_members_select" on public.channel_members;
create policy "channel_members_select" on public.channel_members for select to authenticated
  using (profile_id = (select auth.uid()) or public.can_see_channel(channel_id));

drop policy if exists "channel_members_write" on public.channel_members;
create policy "channel_members_write" on public.channel_members for all to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or public.owns_channel(channel_id)
  )
  with check ((select public.is_internal()));

-- Les sondages suivent la visibilité de leur message.
drop policy if exists "poll_votes_all" on public.poll_votes;
drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select" on public.poll_votes for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = poll_votes.message_id and public.can_see_channel(m.channel_id)
  ));
drop policy if exists "poll_votes_write" on public.poll_votes;
create policy "poll_votes_write" on public.poll_votes for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ---------- Conversations à deux : plus de collision de nom -------------
-- `channels` porte une contrainte d'unicité sur `name` depuis 0006. Les
-- conversations à deux sont créées sans nom : la deuxième échouait sur un
-- doublon de chaîne vide. L'unicité ne concerne désormais que les canaux
-- nommés (les conversations privées sont identifiées par leurs membres).
alter table public.channels drop constraint if exists channels_name_key;
drop index if exists public.channels_name_uniq;
create unique index if not exists channels_name_uniq
  on public.channels (name) where coalesce(dm, false) = false;
