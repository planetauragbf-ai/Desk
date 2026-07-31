-- ============================================================
-- Planet'Desk — Chat : messages non lus
-- À exécuter APRÈS 0019_chat_recursion.sql. Script rejouable.
--
-- Jusqu'ici rien n'indiquait qu'un collègue avait répondu : il fallait
-- ouvrir chaque conversation pour le découvrir.
--
--  • chat_reads : date de dernière lecture, par personne et par
--    conversation (une ligne par couple, mise à jour à l'ouverture) ;
--  • chat_unread() : pour l'appelant, le nombre de messages non lus et
--    la date du dernier message, conversation par conversation. Une
--    seule requête au lieu d'une par conversation.
-- ============================================================

create table if not exists public.chat_reads (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  channel_id   uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (profile_id, channel_id)
);

alter table public.chat_reads enable row level security;

-- Chacun ne gère que ses propres marque-pages de lecture.
drop policy if exists "chat_reads_own" on public.chat_reads;
create policy "chat_reads_own" on public.chat_reads for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

/**
 * Messages non lus de l'appelant, par conversation.
 * Ses propres messages ne comptent jamais comme non lus.
 */
create or replace function public.chat_unread()
returns table (channel_id uuid, unread int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with moi as (select auth.uid() as id),
  -- can_see_channel() n'est évalué qu'une fois par conversation.
  visibles as (
    select c.id from public.channels c where public.can_see_channel(c.id)
  )
  select m.channel_id, count(*)::int, max(m.created_at)
  from public.messages m
  join visibles v on v.id = m.channel_id
  left join public.chat_reads r
    on r.channel_id = m.channel_id and r.profile_id = (select id from moi)
  where m.author_id is distinct from (select id from moi)
    and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by m.channel_id;
$$;

/** Marque une conversation comme lue jusqu'à maintenant. */
create or replace function public.chat_mark_read(cid uuid)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.chat_reads (profile_id, channel_id, last_read_at)
  values (auth.uid(), cid, now())
  on conflict (profile_id, channel_id) do update set last_read_at = now();
$$;

grant execute on function public.chat_unread(), public.chat_mark_read(uuid) to authenticated;

create index if not exists chat_reads_profile_idx on public.chat_reads (profile_id);
create index if not exists messages_author_idx on public.messages (author_id);
