import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { update } from '../lib/data'
import { supabase } from '../lib/supabase'
import { runClaimReminders } from '../lib/reminders'
import { formatDateTime } from '../lib/format'
import { EmptyState, Modal } from '../components/ui'

/**
 * Cloche de notifications du menu : compteur de non-lues, panneau avec
 * la liste, clic = ouvre la page liée et marque lu. Déclenche aussi les
 * rappels automatiques (dossiers à relancer).
 */
export default function NotificationsBell({ mini }: { mini: boolean }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const { rows: notifications, refresh } = useTable(
    'notifications',
    profile ? { user_id: profile.id } : undefined,
    { column: 'created_at', ascending: false },
  )
  const unread = notifications.filter((n) => !n.read)

  // Rappels automatiques (une fois par session)
  useEffect(() => {
    if (profile) runClaimReminders(profile).then(() => refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Temps réel : nouvelle notification → compteur à jour immédiatement.
  useEffect(() => {
    if (!supabase || !profile) return
    const sub = supabase
      .channel(`notifs-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => refresh(),
      )
      .subscribe()
    return () => {
      supabase?.removeChannel(sub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function openNotif(id: string, link: string | null) {
    await update('notifications', id, { read: true })
    refresh()
    setOpen(false)
    if (link) navigate(link)
  }

  async function markAllRead() {
    await Promise.all(unread.map((n) => update('notifications', n.id, { read: true })))
    refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          mini ? 'justify-center px-0' : ''
        } text-aura-700 hover:bg-aura-50 hover:text-aura-900`}
      >
        <span className="relative text-base w-5 text-center shrink-0">
          🔔
          {unread.length > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-4 h-4 rounded-full bg-coral-500 text-white text-[9px] font-bold px-1 leading-4">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </span>
        {!mini && (
          <span className="flex-1 text-left">
            Notifications
            {unread.length > 0 && <span className="ml-1.5 text-coral-600 font-bold">({unread.length})</span>}
          </span>
        )}
      </button>

      {open && (
        <Modal title="🔔 Notifications" onClose={() => setOpen(false)}>
          {unread.length > 0 && (
            <button className="text-xs text-aura-700 underline mb-3" onClick={markAllRead}>
              Tout marquer lu
            </button>
          )}
          {notifications.length === 0 ? (
            <EmptyState>Aucune notification.</EmptyState>
          ) : (
            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {notifications.slice(0, 30).map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openNotif(n.id, n.link)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors hover:bg-aura-50 ${
                      n.read ? 'text-aura-700/70' : 'font-semibold text-aura-900 bg-accent-500/5'
                    }`}
                  >
                    <div>{n.message}</div>
                    <div className="text-[10px] text-aura-700/50 mt-0.5">{formatDateTime(n.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  )
}
