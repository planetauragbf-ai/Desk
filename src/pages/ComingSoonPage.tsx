import { APP_INFO, useBranding, type AppKey } from '../context/BrandingContext'

const DESCRIPTIONS: Partial<Record<AppKey, string>> = {
  dash: 'Dashboard de suivi logistique : indicateurs, flux et performance en un coup d’œil.',
  claim: 'Gestion des sinistres : déclaration, suivi et résolution des dossiers.',
}

/** Emplacement réservé d'une future application Planet'Desk. */
export default function ComingSoonPage({ app }: { app: AppKey }) {
  const { logos } = useBranding()
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="card max-w-md text-center py-10">
        <img src={logos[app]} alt={APP_INFO[app].name} className="h-20 w-20 mx-auto rounded-full border border-aura-100 bg-white object-contain" />
        <h1 className="text-2xl font-extrabold mt-4">{APP_INFO[app].name}</h1>
        <p className="text-sm text-aura-700/80 mt-2">{DESCRIPTIONS[app]}</p>
        <div className="inline-flex items-center gap-2 mt-5 rounded-full bg-accent-500/10 text-accent-500 px-4 py-1.5 text-sm font-semibold">
          🚧 Bientôt disponible
        </div>
        <p className="text-xs text-aura-700/60 mt-4">
          Cet emplacement est réservé : l'application sera intégrée ici, avec les accès gérés par
          l'administrateur comme pour les autres applications.
        </p>
      </div>
    </div>
  )
}
