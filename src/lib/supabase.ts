import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// Capté AVANT createClient : la librairie Supabase traite puis efface le
// fragment #...type=recovery de l'URL au démarrage. Sans cette capture en
// amont, l'écran « nouveau mot de passe » ne saurait pas qu'on revient d'un
// lien de réinitialisation, et l'utilisateur retomberait sur la connexion.
export const isRecoveryLink =
  typeof window !== 'undefined' && /type=recovery/.test(window.location.href)

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!)
  : null

/**
 * Client secondaire sans persistance de session : permet à un admin de
 * créer un compte salarié (signUp) sans être déconnecté de sa propre session.
 */
export function createEphemeralClient(): SupabaseClient | null {
  if (!supabaseConfigured) return null
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
