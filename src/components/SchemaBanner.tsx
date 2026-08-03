import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { verifierBase, type EtatBase } from '../lib/schema'

/**
 * Bandeau d'alerte quand la base est en retard sur l'application.
 *
 * Réservé aux administrateurs : ce sont eux qui exécutent les migrations,
 * et une personne qui n'y peut rien n'a pas à voir passer le message.
 */
export default function SchemaBanner() {
  const { profile } = useAuth()
  const [etat, setEtat] = useState<EtatBase | null>(null)
  const [masque, setMasque] = useState(false)

  useEffect(() => {
    if (profile?.role !== 'admin') return
    verifierBase().then(setEtat).catch(() => {})
  }, [profile])

  if (profile?.role !== 'admin' || masque || !etat || etat.complete) return null

  return (
    <div className="bg-amber-100 text-amber-900 px-4 py-2.5 text-sm">
      <div className="max-w-6xl mx-auto flex flex-wrap items-start gap-x-4 gap-y-1">
        <span className="font-bold">⚠️ La base de données est en retard sur l'application.</span>
        <span>
          Migration{etat.manquants.length > 1 ? 's' : ''} manquante
          {etat.manquants.length > 1 ? 's' : ''} :{' '}
          {etat.manquants.map((m) => `${m.migration} (${m.quoi})`).join(', ')}. Certaines actions
          échoueront tant que <code className="font-mono">supabase/scripts/rattrapage.sql</code> n'aura
          pas été exécuté dans l'éditeur SQL Supabase.
        </span>
        <button
          className="ml-auto text-amber-900/70 hover:text-amber-900 font-semibold"
          onClick={() => setMasque(true)}
        >
          Masquer
        </button>
      </div>
    </div>
  )
}
