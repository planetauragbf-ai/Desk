import { useEffect, useRef, useState } from 'react'

/**
 * Sélecteur d'émojis du chat. Liste embarquée (aucune dépendance
 * extérieure, donc rien à charger et rien qui puisse tomber en panne).
 */
const FAMILLES: { nom: string; onglet: string; emojis: string[] }[] = [
  {
    nom: 'Visages',
    onglet: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😅', '😂', '🙂', '😉', '😊', '😍', '😘', '😗',
      '🤗', '🤔', '😐', '😑', '😶', '🙄', '😏', '😴', '😪', '😌', '😜', '🤪',
      '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '🙁', '😖', '😞',
      '😤', '😢', '😭', '😦', '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳',
      '🤗', '🤭', '🤫', '😷', '🤒', '🤕', '🤢', '🤮', '🥴', '😵', '🤠', '🥳',
    ],
  },
  {
    nom: 'Gestes',
    onglet: '👍',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👈', '👉', '👆', '👇', '☝️',
      '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🙏', '🤝', '👏', '🙌', '👐',
      '✍️', '💅', '🤳', '💃', '🕺', '🤦', '🤷', '🙋', '🙆', '🙅', '💁', '🚶',
    ],
  },
  {
    nom: 'Cœurs & symboles',
    onglet: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞',
      '💯', '✅', '❌', '⚠️', '❓', '❗', '💤', '💢', '💥', '✨', '🔥', '🎉',
      '🎊', '🏆', '⭐', '🌟', '💡', '🔔', '📌', '📍', '⏰', '⌛', '🔒', '🔑',
    ],
  },
  {
    nom: 'Travail',
    onglet: '📦',
    emojis: [
      '📦', '📮', '📝', '📄', '📊', '📈', '📉', '🗂️', '📁', '📅', '🗓️', '📋',
      '✉️', '📧', '📞', '💻', '🖥️', '⌨️', '🖨️', '🚚', '🚛', '✈️', '🚢', '🏭',
      '🏢', '🏬', '💶', '💰', '🧾', '⚖️', '🔧', '🧰', '♻️', '🌍', '🕒', '☑️',
    ],
  },
  {
    nom: 'Vin & table',
    onglet: '🍷',
    emojis: [
      '🍷', '🍾', '🥂', '🍇', '🍺', '🍻', '🥃', '🧊', '🍽️', '🧀', '🥖', '🫒',
      '🍫', '☕', '🫗', '🌡️', '🛢️', '📦', '🏷️', '🇫🇷', '🇮🇹', '🇪🇸', '🇺🇸', '🇩🇪',
    ],
  },
]

export default function EmojiPicker({ onPick, className = '' }: { onPick: (emoji: string) => void; className?: string }) {
  const [ouvert, setOuvert] = useState(false)
  const [famille, setFamille] = useState(0)
  const boite = useRef<HTMLDivElement>(null)

  // Fermeture au clic à l'extérieur et à la touche Échap.
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false)
    }
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false)
    }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', clavier)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', clavier)
    }
  }, [ouvert])

  return (
    <div ref={boite} className={`relative ${className}`}>
      <button
        type="button"
        className="btn-secondary !px-3"
        title="Insérer un émoji"
        aria-expanded={ouvert}
        onClick={() => setOuvert(!ouvert)}
      >
        🙂
      </button>
      {ouvert && (
        <div className="absolute bottom-full right-0 mb-2 z-30 w-[19rem] max-w-[85vw] rounded-xl border border-aura-100 bg-white shadow-xl">
          <div className="flex gap-1 border-b border-aura-100 p-1.5">
            {FAMILLES.map((f, i) => (
              <button
                key={f.nom}
                type="button"
                title={f.nom}
                onClick={() => setFamille(i)}
                className={`flex-1 rounded-lg py-1 text-lg transition-colors ${
                  i === famille ? 'bg-accent-500/10' : 'hover:bg-aura-50'
                }`}
              >
                {f.onglet}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-56 overflow-y-auto">
            {FAMILLES[famille].emojis.map((e, i) => (
              <button
                key={`${e}-${i}`}
                type="button"
                className="rounded-lg py-1 text-xl hover:bg-aura-50"
                onClick={() => {
                  onPick(e)
                  setOuvert(false)
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
