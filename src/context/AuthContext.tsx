import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createEphemeralClient, supabase } from '../lib/supabase'
import { demoMode, get, insert, list, setAuditActor, update } from '../lib/data'
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
  /** Termine le changement de mot de passe obligatoire (première connexion) */
  completeForcedPasswordChange: (newPassword: string) => Promise<string | null>
  /**
   * Création d'un compte salarié par un admin : génère un mot de passe
   * provisoire que l'admin transmet lui-même (pas d'email automatique).
   * code 'exists' = un compte Supabase Auth existe déjà pour cet email.
   */
  createEmployee: (fullName: string, email: string) => Promise<{
    error: string | null
    code?: 'exists'
    userId?: string
    tempPassword?: string
  }>
}

const AuthContext = createContext<AuthState>({
  loading: true,
  profile: null,
  passwordRecovery: false,
  signIn: async () => null,
  signOut: async () => {},
  sendPasswordReset: async () => null,
  completePasswordReset: async () => null,
  completeForcedPasswordChange: async () => null,
  createEmployee: async () => ({ error: null }),
})

/** Mot de passe provisoire lisible (sans caractères ambigus). */
function genTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const part = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join('')
  return `Aura-${part(4)}-${part(4)}`
}

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
        setAuditActor({ id: p.id, name: p.full_name || p.email })
        return
      }
      await new Promise((r) => setTimeout(r, 600))
    }
    // Auto-réparation : le compte Auth existe mais le profil a été supprimé
    // (ex. compte supprimé puis recréé par l'admin) — on le recrée.
    try {
      const { data } = await supabase!.auth.getUser()
      const user = data.user
      if (user) {
        const recreated = await insert('profiles', {
          id: user.id,
          full_name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || '',
          email: user.email ?? '',
          role: 'membre',
        } as Partial<Profile>)
        setProfile(recreated)
        setAuditActor({ id: recreated.id, name: recreated.full_name || recreated.email })
        return
      }
    } catch (e) {
      console.warn('Recréation du profil impossible :', e)
    }
    setProfile(null)
  }

  useEffect(() => {
    if (demoMode) {
      // Mode démo : session locale automatique.
      list('profiles', { id: DEMO_USER_ID } as Partial<Profile>).then((rows) => {
        setProfile(rows[0] ?? null)
        if (rows[0]) setAuditActor({ id: rows[0].id, name: rows[0].full_name })
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
    setAuditActor(null)
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

  async function createEmployee(fullName: string, email: string): Promise<{
    error: string | null
    code?: 'exists'
    userId?: string
    tempPassword?: string
  }> {
    const tempPassword = genTempPassword()
    if (demoMode) {
      const p = await insert('profiles', {
        full_name: fullName,
        email,
        role: 'membre',
        instance_id: null,
        modules: null,
      } as Partial<Profile>)
      return { error: null, userId: p.id, tempPassword }
    }
    // Client éphémère : la création du compte ne déconnecte pas l'admin.
    // Pas d'email automatique : l'admin transmet lui-même le mot de passe
    // provisoire, que le salarié devra changer à sa première connexion.
    const ephemeral = createEphemeralClient()!
    const { data, error } = await ephemeral.auth.signUp({
      email,
      password: tempPassword,
      options: { data: { full_name: fullName } },
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return { error: error.message, code: 'exists' }
      }
      return { error: error.message }
    }
    // Certains projets renvoient un utilisateur "fantôme" sans identités
    // quand l'email existe déjà (confirmation email activée).
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: 'Un compte existe déjà pour cet email.', code: 'exists' }
    }
    return { error: null, userId: data.user?.id, tempPassword }
  }

  async function completeForcedPasswordChange(newPassword: string): Promise<string | null> {
    if (demoMode) return null
    const { error } = await supabase!.auth.updateUser({ password: newPassword })
    if (error) return error.message
    if (profile) {
      try {
        const updated = await update('profiles', profile.id, { must_change_password: false })
        setProfile(updated)
      } catch {
        setProfile({ ...profile, must_change_password: false })
      }
    }
    return null
  }

  return (
    <AuthContext.Provider
      value={{ loading, profile, passwordRecovery, signIn, signOut, sendPasswordReset, completePasswordReset, completeForcedPasswordChange, createEmployee }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
