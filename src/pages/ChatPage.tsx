import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, list, remove, update } from '../lib/data'
import { essayer, messageErreur } from '../lib/erreurs'
import { notify } from '../lib/notify'
import { can } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import { formatDateTime, profileName } from '../lib/format'
import type { Channel, Message } from '../lib/types'
import { Avatar, Card, EmptyState, Modal } from '../components/ui'

/** Téléverse une pièce jointe (bucket "chat") ; data-URL en mode démo. */
async function uploadAttachment(file: File): Promise<{ url: string; type: Message['file_type'] }> {
  const type: Message['file_type'] = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'fichier'
  if (supabase) {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('chat').upload(path, file, { contentType: file.type })
    if (error) throw new Error(`${error.message} — vérifiez que le bucket « chat » existe (migration 0012).`)
    const { data } = supabase.storage.from('chat').getPublicUrl(path)
    return { url: data.publicUrl, type }
  }
  if (file.size > 1_500_000) throw new Error('En mode démo, les fichiers doivent faire moins de 1,5 Mo.')
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Lecture impossible'))
    r.readAsDataURL(file)
  })
  return { url, type }
}

export default function ChatPage() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [managing, setManaging] = useState<Channel | null>(null)
  const [showPoll, setShowPoll] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const { rows: allChannels, refresh: refreshChannels } = useTable('channels', undefined, { column: 'created_at', ascending: true })
  const { rows: members, refresh: refreshMembers } = useTable('channel_members')
  const { rows: profiles } = useTable('profiles', undefined, { column: 'full_name', ascending: true })
  const { rows: votes, refresh: refreshVotes } = useTable('poll_votes')

  // Canaux visibles : publics + privés dont je suis membre (admins : tous).
  // Messages privés (dm) : UNIQUEMENT leurs membres — pas les admins.
  const channels = useMemo(
    () =>
      allChannels.filter((c) => {
        const isMember = members.some((m) => m.channel_id === c.id && m.profile_id === profile?.id)
        if (c.dm) return isMember || c.created_by === profile?.id
        return !c.private || profile?.role === 'admin' || c.created_by === profile?.id || isMember
      }),
    [allChannels, members, profile],
  )
  const canaux = useMemo(() => channels.filter((c) => !c.dm), [channels])
  const dms = useMemo(() => channels.filter((c) => c.dm), [channels])

  /** Nom d'affichage d'une conversation privée : nom du groupe ou noms des autres membres. */
  const dmName = (c: Channel) => {
    if (c.name) return c.name
    const others = members
      .filter((m) => m.channel_id === c.id && m.profile_id !== profile?.id)
      .map((m) => profileName(profiles, m.profile_id))
    return others.join(', ') || 'Conversation'
  }

  const channelId = params.get('canal') ?? channels[0]?.id ?? null
  const channel = channels.find((c) => c.id === channelId) ?? null

  const { rows: messages, refresh: refreshMessages } = useTable(
    'messages',
    // UUID nul tant qu'aucun canal n'est sélectionné : la requête ne renvoie rien.
    { channel_id: channelId ?? '00000000-0000-0000-0000-000000000000' },
    { column: 'created_at', ascending: true },
  )

  // Temps réel : rechargement à chaque nouveau message / vote du canal.
  useEffect(() => {
    if (!supabase || !channelId) return
    const sub = supabase
      .channel(`chat-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, () => refreshMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => refreshVotes())
      .subscribe()
    return () => {
      supabase?.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  // Défilement du fil de messages uniquement (jamais de la page entière).
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, channelId])

  // Ouvrir une conversation marque ses notifications comme lues.
  useEffect(() => {
    if (!channelId || !profile) return
    list('notifications', { user_id: profile.id })
      .then((rows) =>
        Promise.all(
          rows
            .filter((n) => !n.read && n.link === `/chat?canal=${channelId}`)
            .map((n) => update('notifications', n.id, { read: true })),
        ),
      )
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, messages.length])

  /** Notifie les membres d'une conversation privée / d'un groupe. */
  async function notifyRecipients(preview: string) {
    if (!channel || (!channel.dm && !channel.private)) return
    const label = channel.dm ? `votre conversation avec ${profile?.full_name ?? '—'}` : `🔒 ${channel.name}`
    await Promise.all(
      members
        .filter((m) => m.channel_id === channel.id && m.profile_id !== profile?.id)
        .map((m) =>
          notify(m.profile_id, `💬 ${profile?.full_name ?? 'Message'} — ${preview} (${label})`, `/chat?canal=${channel.id}`),
        ),
    )
  }

  const grouped = useMemo(() => {
    const groups: { author_id: string | null; items: Message[] }[] = []
    for (const m of messages) {
      const last = groups[groups.length - 1]
      if (last && last.author_id === m.author_id) last.items.push(m)
      else groups.push({ author_id: m.author_id, items: [m] })
    }
    return groups
  }, [messages])

  const canManageChannel = (c: Channel) =>
    c.created_by === profile?.id || (!c.dm && profile?.role === 'admin')

  const [showNewDm, setShowNewDm] = useState(false)

  async function createDm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const memberIds = fd.getAll('members').map(String)
    const groupName = String(fd.get('name') ?? '').trim()
    if (memberIds.length === 0) {
      alert('Choisissez au moins une personne.')
      return
    }
    // Conversation à deux déjà existante → on l'ouvre au lieu d'en recréer une.
    if (memberIds.length === 1 && !groupName) {
      const other = memberIds[0]
      const existing = dms.find((c) => {
        const ids = members.filter((m) => m.channel_id === c.id).map((m) => m.profile_id)
        return ids.length === 2 && ids.includes(other) && ids.includes(profile?.id ?? '')
      })
      if (existing) {
        setShowNewDm(false)
        setParams({ canal: existing.id })
        return
      }
    }
    const created = await essayer(
      () =>
        insert('channels', {
          name: groupName,
          description: '',
          created_by: profile?.id ?? null,
          private: true,
          dm: true,
        }),
      'Création de la conversation',
    )
    if (!created) return
    const ids = new Set([...memberIds, profile?.id ?? ''])
    await essayer(
      () => Promise.all([...ids].filter(Boolean).map((id) => insert('channel_members', { channel_id: created.id, profile_id: id }))),
      'Ajout des participants',
    )
    setShowNewDm(false)
    refreshChannels()
    refreshMembers()
    setParams({ canal: created.id })
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !channelId) return
    setDraft('')
    try {
      await insert('messages', { channel_id: channelId, author_id: profile?.id ?? null, content })
    } catch (e) {
      setDraft(content) // on rend son texte à l'expéditeur plutôt que de le perdre
      alert(`Envoi impossible : ${messageErreur(e)}`)
      return
    }
    await notifyRecipients(content.slice(0, 60))
    refreshMessages()
  }

  async function sendFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !channelId) return
    setSending(true)
    try {
      const { url, type } = await uploadAttachment(file)
      await insert('messages', {
        channel_id: channelId,
        author_id: profile?.id ?? null,
        content: '',
        file_url: url,
        file_name: file.name,
        file_type: type,
      })
      await notifyRecipients(type === 'image' ? '📷 photo' : `📎 ${file.name}`)
      refreshMessages()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  async function sendPoll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const question = String(fd.get('question')).trim()
    const options = String(fd.get('options'))
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!question || options.length < 2 || !channelId) {
      alert('Il faut une question et au moins 2 réponses (une par ligne).')
      return
    }
    const envoye = await essayer(
      () =>
        insert('messages', {
          channel_id: channelId,
          author_id: profile?.id ?? null,
          content: '',
          poll: { question, options },
        }),
      'Création du questionnaire',
    )
    if (!envoye) return
    await notifyRecipients(`📊 sondage : ${question.slice(0, 50)}`)
    setShowPoll(false)
    refreshMessages()
  }

  async function vote(m: Message, optionIndex: number) {
    const mine = votes.find((v) => v.message_id === m.id && v.profile_id === profile?.id)
    const ok = await essayer(async () => {
      if (mine) await remove('poll_votes', mine.id)
      if (!mine || mine.option_index !== optionIndex) {
        await insert('poll_votes', { message_id: m.id, profile_id: profile?.id ?? '', option_index: optionIndex })
      }
      return true
    }, 'Enregistrement du vote')
    if (ok === null) return
    refreshVotes()
  }

  async function createChannel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const isPrivate = fd.get('private') === 'on'
    const memberIds = fd.getAll('members').map(String)
    const name = String(fd.get('name') ?? '').trim()
    if (!name) {
      alert('Donnez un nom au canal.')
      return
    }
    const created = await essayer(
      () =>
        insert('channels', {
          name,
          description: String(fd.get('description') ?? ''),
          created_by: profile?.id ?? null,
          private: isPrivate,
        }),
      'Création du canal',
    )
    if (!created) return
    if (isPrivate) {
      const ids = new Set([...memberIds, profile?.id ?? ''])
      await essayer(
        () => Promise.all([...ids].filter(Boolean).map((id) => insert('channel_members', { channel_id: created.id, profile_id: id }))),
        'Ajout des membres',
      )
    }
    setShowNewChannel(false)
    refreshChannels()
    refreshMembers()
    setParams({ canal: created.id })
  }

  async function toggleMember(c: Channel, profileId: string) {
    const existing = members.find((m) => m.channel_id === c.id && m.profile_id === profileId)
    const ok = await essayer(async () => {
      if (existing) await remove('channel_members', existing.id)
      else await insert('channel_members', { channel_id: c.id, profile_id: profileId })
      return true
    }, existing ? 'Retrait du membre' : 'Ajout du membre')
    if (ok === null) return
    refreshMembers()
  }

  async function deleteChannel(c: Channel) {
    if (!confirm(`Supprimer le canal « ${c.name} » et tous ses messages ?`)) return
    if ((await essayer(() => remove('channels', c.id), 'Suppression du canal')) === null) return
    setManaging(null)
    refreshChannels()
    if (channelId === c.id) setParams({})
  }

  async function deleteMessage(m: Message) {
    if (!confirm('Supprimer ce message ?')) return
    if ((await essayer(() => remove('messages', m.id), 'Suppression du message')) === null) return
    refreshMessages()
  }

  function MessageBody({ m }: { m: Message }) {
    if (m.poll) {
      const pollVotes = votes.filter((v) => v.message_id === m.id)
      const total = pollVotes.length
      const mine = pollVotes.find((v) => v.profile_id === profile?.id)
      return (
        <div className="rounded-lg border border-aura-100 bg-aura-50/50 p-3 my-1 max-w-md">
          <div className="text-sm font-bold mb-2">📊 {m.poll.question}</div>
          <div className="space-y-1.5">
            {m.poll.options.map((opt, i) => {
              const count = pollVotes.filter((v) => v.option_index === i).length
              const pct = total ? Math.round((count / total) * 100) : 0
              return (
                <button
                  key={i}
                  onClick={() => vote(m, i)}
                  className={`w-full text-left relative rounded-lg border px-3 py-1.5 text-sm overflow-hidden transition-colors ${
                    mine?.option_index === i ? 'border-accent-500' : 'border-aura-100 hover:border-accent-500/50'
                  }`}
                >
                  <span className="absolute inset-y-0 left-0 bg-accent-500/15" style={{ width: `${pct}%` }} />
                  <span className="relative flex justify-between gap-2">
                    <span>{mine?.option_index === i ? '✔ ' : ''}{opt}</span>
                    <span className="text-xs text-aura-700/70">{count} · {pct}%</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="text-[11px] text-aura-700/60 mt-1.5">{total} vote(s) — cliquez pour voter / changer</div>
        </div>
      )
    }
    if (m.file_type === 'image' && m.file_url) {
      return (
        <a href={m.file_url} target="_blank" rel="noreferrer" className="block my-1">
          <img src={m.file_url} alt={m.file_name ?? 'image'} className="max-w-60 max-h-60 rounded-lg border border-aura-100 object-cover" />
        </a>
      )
    }
    if (m.file_url) {
      return (
        <a
          href={m.file_url}
          target="_blank"
          rel="noreferrer"
          download={m.file_name ?? undefined}
          className="inline-flex items-center gap-2 rounded-lg border border-aura-100 bg-aura-50/60 px-3 py-2 my-1 text-sm text-aura-900 hover:border-accent-500"
        >
          <span className="text-lg">{m.file_type === 'pdf' ? '📄' : '📎'}</span>
          <span className="underline">{m.file_name ?? 'Fichier'}</span>
        </a>
      )
    }
    return <p className="text-sm text-aura-900 whitespace-pre-wrap break-words flex-1">{m.content}</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Chat interne</h1>
        {can(profile, 'chat_canaux') && (
          <button className="btn-primary" onClick={() => setShowNewChannel(true)}>+ Nouveau canal</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-start">
        <Card className="md:sticky md:top-6">
          <h2 className="text-sm font-bold text-aura-900 mb-2">Canaux</h2>
          {canaux.length === 0 ? (
            <EmptyState>Aucun canal.</EmptyState>
          ) : (
            <div className="space-y-1">
              {canaux.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setParams({ canal: c.id })}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    c.id === channelId ? 'bg-aura-800 text-white' : 'text-aura-800 hover:bg-aura-50'
                  }`}
                >
                  {c.private ? '🔒' : '#'} {c.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-4 mb-2">
            <h2 className="text-sm font-bold text-aura-900">Messages privés</h2>
            <button className="text-accent-500 text-lg leading-none font-bold" title="Nouveau message privé" onClick={() => setShowNewDm(true)}>+</button>
          </div>
          {dms.length === 0 ? (
            <p className="text-xs text-aura-700/60">Discutez en privé, à deux ou en groupe, avec « + ».</p>
          ) : (
            <div className="space-y-1">
              {dms.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setParams({ canal: c.id })}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors truncate ${
                    c.id === channelId ? 'bg-aura-800 text-white' : 'text-aura-800 hover:bg-aura-50'
                  }`}
                >
                  👥 {dmName(c)}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col min-h-[60vh]">
          {channel ? (
            <>
              <div className="border-b border-aura-100 pb-3 mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold">
                    {channel.dm ? `👥 ${dmName(channel)}` : `${channel.private ? '🔒' : '#'} ${channel.name}`}
                  </h2>
                  {channel.description && <p className="text-xs text-aura-700/70 mt-0.5">{channel.description}</p>}
                  {channel.private && (
                    <p className="text-[11px] text-aura-700/60 mt-0.5">
                      {members.filter((m) => m.channel_id === channel.id).map((m) => profileName(profiles, m.profile_id)).join(', ') || 'Aucun membre'}
                    </p>
                  )}
                </div>
                {canManageChannel(channel) && (
                  <button className="btn-secondary !px-3 !py-1.5 text-xs shrink-0" onClick={() => setManaging(channel)}>Gérer</button>
                )}
              </div>

              <div ref={listRef} className="flex-1 overflow-y-auto space-y-4 pr-1" style={{ maxHeight: '55vh' }}>
                {grouped.length === 0 && <EmptyState>Aucun message pour le moment. Lancez la conversation !</EmptyState>}
                {grouped.map((g) => (
                  <div key={g.items[0].id} className="flex gap-2.5">
                    <Avatar name={profileName(profiles, g.author_id)} size={8} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold">{profileName(profiles, g.author_id)}</span>
                        <span className="text-[11px] text-aura-700/60">{formatDateTime(g.items[0].created_at)}</span>
                      </div>
                      {g.items.map((m) => (
                        <div key={m.id} className="group flex items-start gap-2">
                          <div className="flex-1 min-w-0"><MessageBody m={m} /></div>
                          {(m.author_id === profile?.id || profile?.role === 'admin') && (
                            <button
                              className="opacity-0 group-hover:opacity-100 text-[11px] text-coral-600 underline shrink-0"
                              onClick={() => deleteMessage(m)}
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={sendMessage} className="mt-3 flex gap-2 border-t border-aura-100 pt-3">
                <label className={`btn-secondary !px-3 cursor-pointer ${sending ? 'opacity-50 pointer-events-none' : ''}`} title="Envoyer une photo ou un fichier (PDF…)">
                  {sending ? '⏳' : '📎'}
                  <input type="file" className="hidden" onChange={sendFile} disabled={sending} />
                </label>
                <button type="button" className="btn-secondary !px-3" title="Créer un questionnaire" onClick={() => setShowPoll(true)}>📊</button>
                <input
                  className="input flex-1"
                  placeholder={channel.dm ? `Écrire à ${dmName(channel)}…` : `Écrire dans ${channel.private ? '🔒' : '#'}${channel.name}…`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={!draft.trim()}>Envoyer</button>
              </form>
            </>
          ) : (
            <EmptyState>Sélectionnez ou créez un canal pour discuter avec l'équipe.</EmptyState>
          )}
        </Card>
      </div>

      {showNewChannel && (
        <Modal title="Nouveau canal" onClose={() => setShowNewChannel(false)}>
          <form onSubmit={createChannel} className="space-y-3">
            <div>
              <label className="label">Nom du canal *</label>
              <input name="name" className="input" required placeholder="ex. Communication, Événements…" />
            </div>
            <div>
              <label className="label">Description</label>
              <input name="description" className="input" placeholder="À quoi sert ce canal ?" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="private" />
              Canal privé — visible uniquement des membres choisis
            </label>
            <div>
              <label className="label">Membres (pour un canal privé)</label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-aura-100 p-3 space-y-1.5">
                {profiles.filter((p) => !p.disabled && p.id !== profile?.id).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="members" value={p.id} />
                    {p.full_name}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-aura-700/60 mt-1">Vous êtes automatiquement membre des canaux que vous créez.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNewChannel(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </Modal>
      )}

      {showNewDm && (
        <Modal title="Nouveau message privé" onClose={() => setShowNewDm(false)}>
          <form onSubmit={createDm} className="space-y-3">
            <div>
              <label className="label">Avec qui ? *</label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-aura-100 p-3 space-y-1.5">
                {profiles.filter((p) => !p.disabled && p.id !== profile?.id).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="members" value={p.id} />
                    {p.full_name}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-aura-700/60 mt-1">
                Une personne = discussion à deux · plusieurs = groupe. Personne d'autre ne voit la conversation.
              </p>
            </div>
            <div>
              <label className="label">Nom du groupe (optionnel)</label>
              <input name="name" className="input" placeholder="ex. Équipe événement — sinon les prénoms s'affichent" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNewDm(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Démarrer la conversation</button>
            </div>
          </form>
        </Modal>
      )}

      {managing && (
        <Modal title={managing.dm ? `Gérer 👥 ${dmName(managing)}` : `Gérer ${managing.private ? '🔒' : '#'}${managing.name}`} onClose={() => setManaging(null)}>
          <div className="space-y-4">
            {managing.private ? (
              <div>
                <label className="label">Membres du canal</label>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-aura-100 p-3 space-y-1.5">
                  {profiles.filter((p) => !p.disabled).map((p) => {
                    const isMember = members.some((m) => m.channel_id === managing.id && m.profile_id === p.id)
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={isMember} onChange={() => toggleMember(managing, p.id)} />
                        {p.full_name}
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-aura-700/80">Ce canal est public : toute l'équipe y a accès.</p>
            )}
            <div className="rounded-lg border border-coral-500/30 p-3">
              <button className="text-sm text-coral-600 underline" onClick={() => deleteChannel(managing)}>
                Supprimer ce canal et tous ses messages
              </button>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setManaging(null)}>Fermer</button>
            </div>
          </div>
        </Modal>
      )}

      {showPoll && (
        <Modal title="Créer un questionnaire" onClose={() => setShowPoll(false)}>
          <form onSubmit={sendPoll} className="space-y-3">
            <div>
              <label className="label">Question *</label>
              <input name="question" className="input" required placeholder="ex. Quel jour pour la réunion d'équipe ?" />
            </div>
            <div>
              <label className="label">Réponses possibles * (une par ligne)</label>
              <textarea name="options" className="input" rows={4} required placeholder={'Lundi\nMardi\nMercredi'} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowPoll(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Publier le sondage</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
