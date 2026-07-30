import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { demoMode } from '../lib/data'
import { canAccessModule, type ModuleKey } from '../lib/permissions'
import { useBranding } from '../context/BrandingContext'
import { Avatar } from './ui'

interface NavItem {
  to: string
  label: string
  icon: string
  module?: ModuleKey
}

// Planet'Desk : le portail (espaces communs) héberge deux applications,
// chacune avec son logo et son sous-menu repliable — Planet'Projects
// (pilotage) et Planet'Stock (stockage & picking).
const DESK_NAV: NavItem[] = [
  { to: '/tableau-de-bord', label: 'Accueil', icon: '◧' },
  { to: '/chat', label: 'Chat interne', icon: '💬', module: 'chat' },
  { to: '/assistant', label: 'Assistant Aura', icon: '✦', module: 'assistant' },
  { to: '/documents', label: 'Documents', icon: '▤', module: 'documents' },
  { to: '/liens', label: 'Liens & outils', icon: '⌘', module: 'liens' },
]

const PROJECTS_NAV: NavItem[] = [
  { to: '/projets', label: 'Tableau de bord', icon: '◧' },
  { to: '/objectifs', label: 'Objectifs', icon: '◎', module: 'objectifs' },
  { to: '/pilotage', label: 'Pilotage', icon: '⇗', module: 'pilotage' },
  { to: '/workflows', label: 'Process', icon: '⟳', module: 'workflows' },
  { to: '/notes', label: 'Notes', icon: '✎', module: 'notes' },
  { to: '/organisation', label: 'Organisation', icon: '⌂', module: 'organisation' },
]

const STOCK_NAV: NavItem[] = [
  { to: '/stock', label: 'Stockage & picking', icon: '📦', module: 'stock' },
]

function usePersistedBool(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : raw === '1'
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value ? '1' : '0')
    } catch {
      // stockage indisponible : état non persisté
    }
  }, [key, value])
  return [value, setValue]
}

function NavItems({ items, mini }: { items: NavItem[]; mini: boolean }) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          title={item.label}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mini ? 'justify-center px-0' : ''
            } ${
              isActive
                ? 'bg-accent-500/10 text-accent-500'
                : 'text-aura-700 hover:bg-aura-50 hover:text-aura-900'
            }`
          }
        >
          <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
          {!mini && item.label}
        </NavLink>
      ))}
    </>
  )
}

function AppSection({ logo, label, items, mini, storageKey }: {
  logo: string
  label: string
  items: NavItem[]
  mini: boolean
  storageKey: string
}) {
  const [open, setOpen] = usePersistedBool(storageKey, true)
  if (items.length === 0) return null
  if (mini) {
    return (
      <>
        <div className="flex justify-center pt-4 pb-1" title={label}>
          <img src={logo} alt={label} className="h-6 w-6 rounded-full border border-aura-100 bg-white object-contain" />
        </div>
        <NavItems items={items} mini />
      </>
    )
  }
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 pt-4 pb-1.5 group"
        aria-expanded={open}
      >
        <img src={logo} alt="" className="h-5 w-5 rounded-full border border-aura-100 bg-white object-contain" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-aura-700/60 group-hover:text-aura-700">
          {label}
        </span>
        <span className={`ml-auto text-aura-700/50 text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && <NavItems items={items} mini={false} />}
    </>
  )
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { logos } = useBranding()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = usePersistedBool('desk-nav-fermee', false)

  const visible = (items: NavItem[]) =>
    items.filter((item) => !item.module || canAccessModule(profile, item.module))
  const deskItems = visible(DESK_NAV)
  const projectItems = visible(PROJECTS_NAV)
  const stockItems = visible(STOCK_NAV)
  // Planet'Stock embarque sa propre mise en page : pleine largeur, sans marges.
  const fullBleed = pathname.startsWith('/stock')

  return (
    <div className="min-h-screen flex">
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 bg-white border-r border-aura-100 flex flex-col transition-all duration-200`}
      >
        <div className={`py-5 ${collapsed ? 'px-2' : 'px-5'}`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
            <img src={logos.desk} alt="Planet Aura" className="h-10 w-10 rounded-full border border-aura-100 bg-white p-0.5 object-contain" />
            {!collapsed && (
              <div>
                <div className="font-extrabold leading-tight text-aura-950">Planet’Desk</div>
                <div className="text-[11px] text-aura-700/70 leading-tight">Planet Aura</div>
              </div>
            )}
          </div>
        </div>

        <nav className={`flex-1 space-y-1 overflow-y-auto pb-4 ${collapsed ? 'px-2' : 'px-3'}`}>
          <NavItems items={deskItems} mini={collapsed} />

          {projectItems.length > 1 && (
            <AppSection
              logo={logos.projects}
              label="Planet’Projects"
              items={projectItems}
              mini={collapsed}
              storageKey="desk-nav-projects"
            />
          )}

          {stockItems.length > 0 && (
            <AppSection
              logo={logos.stock}
              label="Planet’Stock"
              items={stockItems}
              mini={collapsed}
              storageKey="desk-nav-stock"
            />
          )}

          {profile?.role === 'admin' && (
            <>
              {!collapsed && (
                <div className="px-3 pt-4 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-aura-700/60">Gestion</span>
                </div>
              )}
              <NavLink
                to="/administration"
                title="Administration"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center px-0 mt-3' : ''
                  } ${
                    isActive
                      ? 'bg-accent-500/10 text-accent-500'
                      : 'text-aura-700 hover:bg-aura-50 hover:text-aura-900'
                  }`
                }
              >
                <span className="text-base w-5 text-center shrink-0">⚙</span>
                {!collapsed && 'Administration'}
              </NavLink>
            </>
          )}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mx-2 mb-2 rounded-lg py-2 text-aura-700/70 hover:bg-aura-50 hover:text-aura-900 text-sm font-medium flex items-center justify-center gap-2"
          title={collapsed ? 'Ouvrir le menu' : 'Fermer le menu'}
        >
          <span className="text-base">{collapsed ? '»' : '«'}</span>
          {!collapsed && 'Fermer le menu'}
        </button>

        <div className={`py-4 border-t border-aura-100 ${collapsed ? 'px-2' : 'px-5'}`}>
          {profile && (
            <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
              <Avatar name={profile.full_name} size={8} />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate text-aura-950">{profile.full_name}</div>
                  <button onClick={signOut} className="text-[11px] text-aura-700/70 hover:text-aura-950">
                    {demoMode ? 'Mode démo' : 'Se déconnecter'}
                  </button>
                </div>
              )}
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
        <main className={fullBleed ? '' : 'p-6 max-w-6xl mx-auto'}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
