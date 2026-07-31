import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { list } from '../lib/data'
import { supabase } from '../lib/supabase'
import { Avatar } from './ui'
import type { Message, Profile } from '../lib/types'

interface Toast {
  id: string
  auteur: string
  texte: string
  channelId: string
}

/**
 * Fenêtre surgissante en bas à droite à chaque nouveau message.
 *
 * Montée dans la mise en page générale : on est prévenu où qu'on soit
 * dans Planet'Desk, pas seulement sur la page Chat. Un clic ouvre la
 * conversation concernée. Rien ne s'affiche pour ses propres messages,
 * ni pour la conversation déjà ouverte à l'écran.
 */
export default function ChatToasts() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const [toasts, setToasts] = useState<Toast[]>([])
  const profiles = useRef<Profile[]>([])

  // La conversation affichée à l'écran ne doit pas déclencher de fenêtre.
  const canalOuvert = pathname === '/chat' ? params.get('canal') : null
  const canalOuvertRef = useRef<string | null>(canalOuvert)
  canalOuvertRef.current = canalOuvert

  useEffect(() => {
    list('profiles')
      .then((r) => {
        profiles.current = r
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!supabase || !profile) return
    const sub = supabase
      .channel('chat-toasts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message
        if (!m || m.author_id === profile.id) return
        if (m.channel_id === canalOuvertRef.current) return
        const auteur = profiles.current.find((p) => p.id === m.author_id)?.full_name ?? 'Nouveau message'
        const texte = m.content?.trim()
          ? m.content
          : m.poll
            ? `📊 ${m.poll.question}`
            : m.file_type === 'image'
              ? '📷 Photo'
              : m.file_name
                ? `📎 ${m.file_name}`
                : 'Pièce jointe'
        setToasts((t) => [...t.slice(-2), { id: m.id, auteur, texte, channelId: m.channel_id }])
        // Disparition automatique au bout de 8 secondes.
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== m.id)), 8000)
      })
      .subscribe()
    return () => {
      supabase?.removeChannel(sub)
    }
  }, [profile])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[19rem] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="rounded-xl border border-aura-100 bg-white shadow-xl p-3 flex items-start gap-2.5 cursor-pointer hover:shadow-2xl transition-shadow"
          onClick={() => {
            setToasts((x) => x.filter((y) => y.id !== t.id))
            navigate(`/chat?canal=${t.channelId}`)
          }}
        >
          <Avatar name={t.auteur} size={8} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-aura-950 truncate">{t.auteur}</div>
            <div className="text-xs text-aura-700/80 line-clamp-2 break-words">{t.texte}</div>
          </div>
          <button
            className="text-aura-700/50 hover:text-aura-900 text-sm leading-none shrink-0"
            aria-label="Fermer"
            onClick={(e) => {
              e.stopPropagation()
              setToasts((x) => x.filter((y) => y.id !== t.id))
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
