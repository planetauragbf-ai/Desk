import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadUnread, type Unread } from '../lib/chat'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface UnreadState {
  unread: Unread
  refresh: () => void
}

const Ctx = createContext<UnreadState>({ unread: {}, refresh: () => {} })

/**
 * Compteurs de messages non lus, chargés UNE SEULE FOIS pour toute
 * l'application.
 *
 * Le menu et la page Chat les affichent tous les deux. Quand chacun
 * ouvrait son propre abonnement temps réel, les deux portaient le même
 * nom de canal — Supabase refuse un second abonnement au même nom, et
 * l'erreur remontée faisait échouer le rendu de la page Chat. Un seul
 * fournisseur, un seul abonnement, deux lecteurs.
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const profileId = profile?.id ?? null
  const [unread, setUnread] = useState<Unread>({})

  const refresh = useCallback(() => {
    if (!profileId) {
      setUnread({})
      return
    }
    loadUnread(profileId)
      .then(setUnread)
      .catch((e) => console.warn('Compteurs de messages non lus :', e))
  }, [profileId])

  useEffect(() => refresh(), [refresh])

  useEffect(() => {
    if (!supabase || !profileId) return
    const sub = supabase
      .channel(`desk-unread-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => refresh())
      .subscribe()
    return () => {
      supabase?.removeChannel(sub)
    }
  }, [profileId, refresh])

  const value = useMemo(() => ({ unread, refresh }), [unread, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUnread() {
  return useContext(Ctx)
}
