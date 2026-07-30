import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { demoMode, get, list } from '../lib/data'
import { DEMO_USER_ID } from '../lib/localdb'
import type { Profile } from '../lib/types'

interface AuthState {
  loading: boolean
  profile: Profile | null
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  loading: true,
  profile: null,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)

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
    const { data: sub } = supabase!.auth.onAuthStateChange(async (_event, session) => {
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

  async function signUp(email: string, password: string, fullName: string): Promise<string | null> {
    if (demoMode) return null
    const { error } = await supabase!.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return error ? error.message : null
  }

  async function signOut() {
    if (demoMode) return
    await supabase!.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ loading, profile, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
