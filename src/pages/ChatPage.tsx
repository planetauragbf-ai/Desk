import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove } from '../lib/data'
import { supabase } from '../lib/supabase'
import { formatDateTime, profileName } from '../lib/format'
import type { Message } from '../lib/types'
import { Avatar, Card, EmptyState, Modal } from '../components/ui'

export default function ChatPage() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const { rows: channels, refresh: refreshChannels } = useTable('channels', undefined, { column: 'created_at', ascending: true })
  const { rows: profiles } = useTable('profiles')

  const channelId = params.get('canal') ?? channels[0]?.id ?? null
  const channel = channels.find((c) => c.id === channelId) ?? null

  const { rows: messages, refresh: refreshMessages } = useTable(
    'messages',
    // UUID nul tant qu'aucun canal n'est sélectionné : la requête ne renvoie rien.
    { channel_id: channelId ?? '00000000-0000-0000-0000-000000000000' },
    { column: 'created_at', ascending: true },
  )

  // Temps réel : rechargement à chaque nouveau message du canal (Supabase).
  useEffect(() => {
    if (!supabase || !channelId) return
    const sub = supabase
      .channel(`chat-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        () => refreshMessages(),
      )
      .subscribe()
    return () => {
      supabase?.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, channelId])

  const grouped = useMemo(() => {
    // Regroupe les messages consécutifs d'un même auteur (affichage plus lisible).
    const groups: { author_id: string | null; items: Message[] }[] = []
    for (const m of messages) {
      const last = groups[groups.length - 1]
      if (last && last.author_id === m.author_id) last.items.push(m)
      else groups.push({ author_id: m.author_id, items: [m] })
    }
    return groups
  }, [messages])

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !channelId) return
    setDraft('')
    await insert('messages', { channel_id: channelId, author_id: profile?.id ?? null, content })
    refreshMessages()
  }

  async function createChannel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const created = await insert('channels', {
      name: String(fd.get('name')),
      description: String(fd.get('description') ?? ''),
      created_by: profile?.id ?? null,
    })
    setShowNewChannel(false)
    refreshChannels()
    setParams({ canal: created.id })
  }

  async function deleteMessage(m: Message) {
    if (!confirm('Supprimer ce message ?')) return
    await remove('messages', m.id)
    refreshMessages()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Chat interne</h1>
        <button className="btn-primary" onClick={() => setShowNewChannel(true)}>+ Nouveau canal</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-start">
        <Card title="Canaux" className="md:sticky md:top-6">
          {channels.length === 0 ? (
            <EmptyState>Aucun canal. Créez le premier !</EmptyState>
          ) : (
            <div className="space-y-1">
              {channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setParams({ canal: c.id })}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    c.id === channelId ? 'bg-aura-800 text-white' : 'text-aura-800 hover:bg-aura-50'
                  }`}
                >
                  # {c.name}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col min-h-[60vh]">
          {channel ? (
            <>
              <div className="border-b border-aura-100 pb-3 mb-3">
                <h2 className="text-sm font-bold"># {channel.name}</h2>
                {channel.description && <p className="text-xs text-aura-700/70 mt-0.5">{channel.description}</p>}
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1" style={{ maxHeight: '55vh' }}>
                {grouped.length === 0 && (
                  <EmptyState>Aucun message pour le moment. Lancez la conversation !</EmptyState>
                )}
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
                          <p className="text-sm text-aura-900 whitespace-pre-wrap break-words flex-1">{m.content}</p>
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
                <div ref={endRef} />
              </div>

              <form onSubmit={sendMessage} className="mt-3 flex gap-2 border-t border-aura-100 pt-3">
                <input
                  className="input flex-1"
                  placeholder={`Écrire dans #${channel.name}…`}
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
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNewChannel(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
