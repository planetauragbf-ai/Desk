import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createEphemeralClient, supabase } from '../lib/supabase'
import { demoMode, get, insert, list } from '../lib/data'
import { DEMO_USER_ID } from '../lib/localdb'
import type { Profile } from '../lib/types'

interface AuthState {
  loading: boolean
  profile: Profile | null
  /** true quand l'utilisateur arrive via un lien email « définir mon mot de passe » */
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  /** Envoie l'email de (ré)initialisation de mot de passe */
  sendPasswordReset: (email: string) => Promise<string | null>
  /** Termine la définition du mot de passe après clic sur le lien email */
  completePasswordReset: (newPassword: string) => Promise<string | null>
  /** Création d'un compte salarié par un admin ; envoie l'email d'accès */
  createEmployee: (fullName: string, email: string) => Promise<{ error: string | null; userId?: string }>
}

const AuthContext = createContext<AuthState>({
  loading: true,
  profile: null,
  passwordRecovery: false,
  signIn: async () => null,
  signOut: async () => {},
  sendPasswordReset: async () => null,
  completePasswordReset: async () => null,
  createEmployee: async () => ({ error: null }),
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  async function loadProfile(userId: string) {
    // Le trigger côté base crée le profil à l'inscription ; petite tolérance
    // au délai de propagation.
    for (let i = 0; i < 3; i++) {
      const p = await get('profiles', userId)
      if (p) {
        setProfile(p)
        return
      }
      await new Promise((r) => setTimeout(r, 600))
    }
    setProfile(null)
  }

  useEffect(() => {
    if (demoMode) {
      // Mode démo : session locale automatique.
      list('profiles', { id: DEMO_USER_ID } as Partial<Profile>).then((rows) => {
        setProfile(rows[0] ?? null)
        setLoading(false)
      })
      return
    }
    supabase!.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) await loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase!.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (session?.user) await loadProfile(session.user.id)
      else setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    if (demoMode) return null
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  async function signOut() {
    if (demoMode) return
    await supabase!.auth.signOut()
    setProfile(null)
  }

  async function sendPasswordReset(email: string): Promise<string | null> {
    if (demoMode) return null
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    return error ? error.message : null
  }

  async function completePasswordReset(newPassword: string): Promise<string | null> {
    if (demoMode) return null
    const { error } = await supabase!.auth.updateUser({ password: newPassword })
    if (error) return error.message
    setPasswordRecovery(false)
    return null
  }

  async function createEmployee(fullName: string, email: string): Promise<{ error: string | null; userId?: string }> {
    if (demoMode) {
      const p = await insert('profiles', {
        full_name: fullName,
        email,
        role: 'membre',
        instance_id: null,
        modules: null,
      } as Partial<Profile>)
      return { error: null, userId: p.id }
    }
    // Client éphémère : la création du compte ne déconnecte pas l'admin.
    const ephemeral = createEphemeralClient()!
    const tempPassword = `Tmp!${crypto.randomUUID()}`
    const { data, error } = await ephemeral.auth.signUp({
      email,
      password: tempPassword,
      options: { data: { full_name: fullName } },
    })
    if (error) return { error: error.message }
    // Email d'accès : le salarié clique et définit son propre mot de passe.
    const { error: resetError } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (resetError) return { error: resetError.message, userId: data.user?.id }
    return { error: null, userId: data.user?.id }
  }

  return (
    <AuthContext.Provider
      value={{ loading, profile, passwordRecovery, signIn, signOut, sendPasswordReset, completePasswordReset, createEmployee }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
