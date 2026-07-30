import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBranding } from '../context/BrandingContext'
import { canAccessModule, type ModuleKey } from '../lib/permissions'

// Accueil Planet'Desk : uniquement les accès aux applications et aux
// espaces communs. Le suivi du plan d'actions vit dans le tableau de
// bord de Planet'Projects (/projets).
export default function Dashboard() {
  const { profile } = useAuth()
  const { logos } = useBranding()

  const apps: { logo: string; to: string; module: ModuleKey; title: string; desc: string; soon?: boolean }[] = [
    {
      logo: logos.projects,
      to: '/projets',
      module: 'objectifs',
      title: 'Planet’Projects',
      desc: 'Pilotage : objectifs, plans d’actions, process, notes et décisions.',
    },
    {
      logo: logos.dash,
      to: '/dash',
      module: 'dash',
      title: 'Planet’Dash',
      desc: 'Suivi des expéditions : UE, Pays Tiers, USA, tracking Ship24.',
    },
    {
      logo: logos.stock,
      to: '/stock',
      module: 'stock',
      title: 'Planet’Stock',
      desc: 'Stockage & picking : références, entrées/sorties, espaces, relevés.',
    },
    {
      logo: logos.claim,
      to: '/claim',
      module: 'claim',
      title: 'Planet’Claim',
      desc: 'Gestion des sinistres.',
      soon: true,
    },
  ]

  const spaces: { icon: string; to: string; module: ModuleKey; title: string; desc: string }[] = [
    { icon: '💬', to: '/chat', module: 'chat', title: 'Chat interne', desc: "Discuter avec l'équipe" },
    { icon: '✦', to: '/assistant', module: 'assistant', title: 'Assistant Aura', desc: 'Chercher dans toutes les données' },
    { icon: '▤', to: '/documents', module: 'documents', title: 'Documents', desc: 'Déposer et retrouver les fichiers' },
    { icon: '⌘', to: '/liens', module: 'liens', title: 'Liens & outils', desc: 'Tous les outils de l’équipe' },
    { icon: '🗓', to: '/calendrier', module: 'calendrier', title: 'Calendrier & congés', desc: 'Planning, absences et demandes de congés' },
  ]

  const visibleApps = apps.filter((a) => canAccessModule(profile, a.module))
  const visibleSpaces = spaces.filter((s) => canAccessModule(profile, s.module))

  // Un compte limité à Planet'Stock (ex. adhérent) arrive directement
  // dans son espace, sans passer par l'accueil.
  if (visibleSpaces.length === 0 && visibleApps.length === 1 && visibleApps[0].to === '/stock') {
    return <Navigate to="/stock" replace />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">
          Bonjour {profile?.full_name?.split(' ')[0] ?? ''} 👋
        </h1>
        <p className="text-sm text-aura-700/80 mt-1">Bienvenue sur Planet'Desk, le bureau numérique de Planet Aura.</p>
      </div>

      {visibleApps.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-aura-700/60 mb-3">Applications</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleApps.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="card flex items-center gap-4 hover:shadow-lg transition-shadow"
              >
                <img src={a.logo} alt={a.title} className="h-14 w-14 rounded-full border border-aura-100 bg-white object-contain" />
                <div className="min-w-0">
                  <div className="text-base font-extrabold text-aura-950 flex items-center gap-2">
                    {a.title}
                    {a.soon && (
                      <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        Bientôt
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-aura-700/80 mt-0.5">{a.desc}</div>
                </div>
                <span className="ml-auto text-accent-500 text-xl">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {visibleSpaces.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-aura-700/60 mb-3">Espaces communs</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {visibleSpaces.map((s) => (
              <Link key={s.to} to={s.to} className="card text-center hover:shadow-lg transition-shadow">
                <span className="flex h-11 w-11 mx-auto items-center justify-center rounded-lg bg-accent-500/10 text-accent-500 text-xl">
                  {s.icon}
                </span>
                <div className="text-sm font-bold text-aura-950 mt-2">{s.title}</div>
                <div className="text-[11px] text-aura-700/70 mt-0.5">{s.desc}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
