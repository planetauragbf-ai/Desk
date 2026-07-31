import { useEffect, useState } from 'react'
import { surErreur, type ErreurAffichee } from '../lib/erreurs'

/**
 * Bandeau d'erreurs, en bas au centre.
 *
 * Remplace les `alert()` bloquants et, surtout, rend visibles les échecs
 * d'enregistrement qui ne remontaient nulle part : l'action paraissait
 * simplement sans effet.
 */
export default function ErrorToasts() {
  const [erreurs, setErreurs] = useState<ErreurAffichee[]>([])

  useEffect(() =>
    surErreur((e) => {
      setErreurs((liste) => [...liste.slice(-2), e])
      setTimeout(() => setErreurs((liste) => liste.filter((x) => x.id !== e.id)), 9000)
    }),
  [])

  if (erreurs.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-[26rem] max-w-[calc(100vw-2rem)]">
      {erreurs.map((e) => (
        <div
          key={e.id}
          role="alert"
          className="rounded-xl border border-coral-600/30 bg-white shadow-xl p-3 flex items-start gap-2.5"
        >
          <span className="text-lg leading-none shrink-0">⚠️</span>
          <div className="min-w-0 flex-1">
            {e.contexte && <div className="text-sm font-bold text-aura-950">{e.contexte}</div>}
            <div className="text-xs text-aura-700/90 break-words">{e.message}</div>
          </div>
          <button
            className="text-aura-700/50 hover:text-aura-900 text-sm leading-none shrink-0"
            aria-label="Fermer"
            onClick={() => setErreurs((liste) => liste.filter((x) => x.id !== e.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
