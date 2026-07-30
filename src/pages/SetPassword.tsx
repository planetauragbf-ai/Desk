import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'

/** Affiché quand le salarié arrive via le lien email « définir mon mot de passe ». */
export default function SetPassword() {
  const { completePasswordReset } = useAuth()
  const { logoUrl } = useBranding()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    try {
      const err = await completePasswordReset(password)
      if (err) setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-aura-950 via-aura-900 to-accent-400 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <img src={logoUrl} alt="Planet Aura" className="h-12 w-12 rounded-full object-contain" />
          <h1 className="text-xl font-extrabold text-aura-950">Bienvenue !</h1>
        </div>
        <p className="text-sm text-aura-700 mb-6">Choisissez votre mot de passe pour accéder à Planet’Projects.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="pw">Nouveau mot de passe</label>
            <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="8 caractères minimum" />
          </div>
          <div>
            <label className="label" htmlFor="pw2">Confirmez le mot de passe</label>
            <input id="pw2" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          {error && <p className="text-sm text-coral-600">{error}</p>}
          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
            {busy ? 'Un instant…' : 'Définir mon mot de passe et entrer'}
          </button>
        </form>
      </div>
    </div>
  )
}
