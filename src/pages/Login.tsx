import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'

export default function Login() {
  const { signIn, sendPasswordReset } = useAuth()
  const { logoUrl } = useBranding()
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const err = await signIn(email, password)
        if (err) setError(err === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : err)
      } else {
        const err = await sendPasswordReset(email)
        if (err) setError(err)
        else setInfo('Email envoyé. Cliquez sur le lien reçu pour définir votre mot de passe, puis reconnectez-vous.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sand p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-aura-100">
        <div className="flex items-center gap-3 mb-6">
          <img src={logoUrl} alt="Planet Aura" className="h-12 w-12 rounded-full object-contain" />
          <div>
            <h1 className="text-xl font-extrabold text-aura-950">Planet’Desk</h1>
            <p className="text-xs text-aura-700">Le bureau numérique de Planet Aura — projets, stock, chat & documents</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mode === 'signin' && (
            <div>
              <label className="label" htmlFor="password">Mot de passe</label>
              <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}

          {error && <p className="text-sm text-coral-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}

          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
            {busy ? 'Un instant…' : mode === 'signin' ? 'Se connecter' : 'Recevoir le lien par email'}
          </button>
        </form>

        <button
          className="mt-4 text-sm text-aura-700 hover:text-aura-950 underline"
          onClick={() => { setMode(mode === 'signin' ? 'reset' : 'signin'); setError(null); setInfo(null) }}
        >
          {mode === 'signin' ? 'Mot de passe oublié ou premier accès ?' : '← Retour à la connexion'}
        </button>

        <p className="mt-4 text-xs text-aura-700/70">
          Les comptes sont créés par l'administrateur Planet Aura. Vous avez reçu un email d'accès ?
          Cliquez sur son lien pour définir votre mot de passe.
        </p>
      </div>
    </div>
  )
}
