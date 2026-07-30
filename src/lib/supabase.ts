import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

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
