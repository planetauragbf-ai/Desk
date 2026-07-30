import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { demoMode } from '../lib/data'
import { canAccessModule, type ModuleKey } from '../lib/permissions'
import { useBranding } from '../context/BrandingContext'
import { Avatar } from './ui'

const NAV: { to: string; label: string; icon: string; module?: ModuleKey }[] = [
  { to: '/tableau-de-bord', label: 'Tableau de bord', icon: '◧' },
  { to: '/objectifs', label: 'Objectifs', icon: '◎', module: 'objectifs' },
  { to: '/pilotage', label: 'Pilotage', icon: '⇗', module: 'pilotage' },
  { to: '/workflows', label: 'Workflows', icon: '⟳', module: 'workflows' },
  { to: '/notes', label: 'Notes', icon: '✎', module: 'notes' },
  { to: '/documents', label: 'Documents', icon: '▤', module: 'documents' },
  { to: '/organisation', label: 'Organisation', icon: '⌂', module: 'organisation' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { logoUrl } = useBranding()
  const items = NAV.filter((item) => !item.module || canAccessModule(profile, item.module))

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-aura-950 text-white flex flex-col">
        <div className="px-5 py-6">
          <div className="flex items-center gap-2.5">
            <img src={logoUrl} alt="Planet AURA" className="h-10 w-10 rounded-full bg-white/90 p-0.5 object-contain" />
            <div>
              <div className="font-extrabold leading-tight">Planet'Projects</div>
              <div className="text-[11px] text-white/60 leading-tight">Planet AURA</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          {profile?.role === 'admin' && (
            <NavLink
              to="/administration"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-base w-5 text-center">⚙</span>
              Administration
            </NavLink>
          )}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          {profile && (
            <div className="flex items-center gap-2.5">
              <Avatar name={profile.full_name} size={8} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{profile.full_name}</div>
                <button onClick={signOut} className="text-[11px] text-white/60 hover:text-white">
                  {demoMode ? 'Mode démo' : 'Se déconnecter'}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {demoMode && (
          <div className="bg-amber-100 text-amber-900 text-xs px-6 py-1.5 text-center font-medium">
            Mode démo — données stockées dans ce navigateur. Configurez Supabase (voir README) pour un espace partagé.
          </div>
        )}
        <main className="p-6 max-w-6xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
