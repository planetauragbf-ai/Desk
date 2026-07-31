import { useCallback, useEffect, useState } from 'react'
import { loadUnread, type Unread } from '../lib/chat'
import { supabase } from '../lib/supabase'

/**
 * Compteurs de messages non lus, rafraîchis :
 *  - au montage et quand `cle` change (navigation, changement de canal) ;
 *  - à chaque message reçu (temps réel Supabase).
 */
export function useUnread(profileId: string | null | undefined, cle: string) {
  const [unread, setUnread] = useState<Unread>({})

  const refresh = useCallback(() => {
    let annule = false
    loadUnread(profileId).then((u) => {
      if (!annule) setUnread(u)
    })
    return () => {
      annule = true
    }
  }, [profileId])

  useEffect(() => refresh(), [refresh, cle])

  useEffect(() => {
    if (!supabase || !profileId) return
    const sub = supabase
      .channel(`unread-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => refresh())
      .subscribe()
    return () => {
      supabase?.removeChannel(sub)
    }
  }, [profileId, refresh])

  return unread
}
