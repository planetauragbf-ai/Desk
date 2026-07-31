/**
 * Suivi des messages non lus.
 *
 * En base : la table `chat_reads` retient la date de dernière lecture de
 * chaque personne pour chaque conversation, et la fonction `chat_unread()`
 * renvoie les compteurs en une seule requête (migration 0020).
 *
 * En mode démo (sans Supabase), la même chose est calculée dans le
 * navigateur à partir de localStorage.
 */
import { list } from './data'
import { supabase } from './supabase'

export type Unread = Record<string, { unread: number; lastAt: string }>

const CLE_DEMO = 'desk-chat-lectures'

function lecturesDemo(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CLE_DEMO) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** Compteurs de non-lus par conversation, pour la personne connectée. */
export async function loadUnread(profileId: string | null | undefined): Promise<Unread> {
  if (!profileId) return {}
  if (supabase) {
    const { data, error } = await supabase.rpc('chat_unread')
    if (error) {
      // La migration 0020 n'est pas encore passée : pas de compteur,
      // mais le chat continue de fonctionner normalement.
      console.warn('Compteurs de messages non lus :', error.message)
      return {}
    }
    const out: Unread = {}
    for (const r of (data ?? []) as { channel_id: string; unread: number; last_at: string }[]) {
      out[r.channel_id] = { unread: r.unread, lastAt: r.last_at }
    }
    return out
  }
  const lectures = lecturesDemo()
  const messages = await list('messages')
  const out: Unread = {}
  for (const m of messages) {
    if (m.author_id === profileId) continue
    const depuis = lectures[m.channel_id]
    if (depuis && m.created_at <= depuis) continue
    const e = (out[m.channel_id] ??= { unread: 0, lastAt: m.created_at })
    e.unread += 1
    if (m.created_at > e.lastAt) e.lastAt = m.created_at
  }
  return out
}

/** Marque une conversation comme lue jusqu'à maintenant. */
export async function markRead(channelId: string | null | undefined) {
  if (!channelId) return
  if (supabase) {
    const { error } = await supabase.rpc('chat_mark_read', { cid: channelId })
    if (error) console.warn('Marquage de lecture :', error.message)
    return
  }
  try {
    const lectures = lecturesDemo()
    lectures[channelId] = new Date().toISOString()
    localStorage.setItem(CLE_DEMO, JSON.stringify(lectures))
  } catch {
    // stockage indisponible
  }
}

/** Total à afficher sur l'onglet « Chat interne ». */
export function totalUnread(u: Unread): number {
  return Object.values(u).reduce((n, e) => n + e.unread, 0)
}
