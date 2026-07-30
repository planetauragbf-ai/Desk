import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { demoMode } from '../lib/data'
import { canAccessModule, type ModuleKey } from '../lib/permissions'
import { useBranding } from '../context/BrandingContext'
import type { Profile } from '../lib/types'
import { Avatar } from './ui'

interface NavItem {
  to: string
  label: string
  icon: string
  module?: ModuleKey
}

// Planet'Desk : le portail (espaces communs) héberge les applications,
// chacune avec son logo et son sous-menu repliable, dans l'ordre :
// Planet'Projects, Planet'Dash, Planet'Stock, Planet'Claim.
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

const DASH_NAV: NavItem[] = [
  { to: '/dash', label: 'Suivi logistique', icon: '📈', module: 'dash' },
]

const CLAIM_NAV: NavItem[] = [
  { to: '/claim', label: 'Gestion des sinistres', icon: '🛡', module: 'claim' },
]

/** Groupe d'items du bandeau ; label null = items affichés directement. */
interface NavGroup {
  label: string | null
  items: NavItem[]
}

/**
 * Sous-menu Planet'Stock : les onglets de l'application, directement dans
 * le bandeau gauche et regroupés par catégorie (Opérations, Facturation,
 * Administration), chacune repliable. La liste dépend des droits stock du
 * salarié définis par l'admin.
 */
function stockNav(profile: Profile | null): NavGroup[] {
  const t = (id: string, label: string, icon: string): NavItem => ({
    to: `/stock?onglet=${id}`,
    label,
    icon,
    module: 'stock',
  })
  const acc = profile?.stock_access ?? null
  const role = acc?.role ?? (profile?.role === 'admin' ? 'admin' : null)

  if (role === 'adherent') return [{ label: null, items: [t('adherent', 'Mon espace', '👤')] }]

  if (role === 'admin') {
    return [
      { label: null, items: [t('dashboard', 'Dashboard', '📊')] },
      {
        label: 'Opérations',
        items: [t('entrees', 'Entrées', '📥'), t('references', 'Références', '🍷'), t('sorties', 'Sorties', '📤'), t('espaces', 'Espaces', '🗄')],
      },
      {
        label: 'Facturation',
        items: [t('facturation', 'Relevés', '🧾'), t('compta', 'Compta matière', '⚖'), t('grille', 'Tarifs', '📋')],
      },
      {
        label: 'Administration',
        items: [t('adherents', 'Adhérents', '👥'), t('users', 'Utilisateurs', '🔐'), t('journal', 'Journal', '📝'), t('reglages', 'Réglages', '⚙')],
      },
    ]
  }

  // Logisticien (droits choisis par l'admin) ou correspondance email : on
  // n'affiche que les onglets autorisés.
  const p = acc?.role === 'logisticien' ? acc.permissions ?? {} : null
  const ok = (k: keyof NonNullable<typeof p>) => p === null || !!p[k]
  const operations: NavItem[] = []
  if (ok('entrees')) operations.push(t('entrees', 'Entrées', '📥'), t('references', 'Références', '🍷'))
  if (ok('sorties')) operations.push(t('sorties', 'Sorties', '📤'))
  if (ok('espaces')) operations.push(t('espaces', 'Espaces', '🗄'))
  const facturation: NavItem[] = []
  if (ok('facturation')) facturation.push(t('facturation', 'Relevés', '🧾'))
  if (ok('compta')) facturation.push(t('compta', 'Compta matière', '⚖'))
  if (ok('grille')) facturation.push(t('grille', 'Tarifs', '📋'))
  const groups: NavGroup[] = [{ label: null, items: [t('dashboard', 'Dashboard', '📊')] }]
  if (operations.length) groups.push({ label: 'Opérations', items: operations })
  if (facturation.length) groups.push({ label: 'Facturation', items: facturation })
  groups.push({ label: 'Suivi', items: [t('journal', 'Journal', '📝')] })
  return groups
}

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

const itemClass = (active: boolean, mini: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    mini ? 'justify-center px-0' : ''
  } ${active ? 'bg-accent-500/10 text-accent-500' : 'text-aura-700 hover:bg-aura-50 hover:text-aura-900'}`

function NavItems({ items, mini }: { items: NavItem[]; mini: boolean }) {
  const { pathname, search } = useLocation()
  return (
    <>
      {items.map((item) => {
        // Liens avec paramètres (onglets Planet'Stock) : activité calculée
        // sur le chemin ET l'onglet courant.
        if (item.to.includes('?')) {
          const [path, query] = item.to.split('?')
          const wanted = new URLSearchParams(query).get('onglet') ?? 'dashboard'
          const current = new URLSearchParams(search).get('onglet') ?? 'dashboard'
          const active = pathname === path && wanted === current
          return (
            <Link key={item.to} to={item.to} title={item.label} className={itemClass(active, mini)}>
              <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
              {!mini && item.label}
            </Link>
          )
        }
        return (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) => itemClass(isActive, mini)}
          >
            <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
            {!mini && item.label}
          </NavLink>
        )
      })}
    </>
  )
}

/** Sous-catégorie repliable à l'intérieur d'une section d'application. */
function SubGroup({ label, items, storageKey }: { label: string; items: NavItem[]; storageKey: string }) {
  const [open, setOpen] = usePersistedBool(storageKey, true)
  return (
    <div className="pl-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 pt-2 pb-1 group"
        aria-expanded={open}
      >
        <span className={`text-aura-700/40 text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-aura-700/50 group-hover:text-aura-700">
          {label}
        </span>
      </button>
      {open && <NavItems items={items} mini={false} />}
    </div>
  )
}

function AppSection({ logo, label, groups, mini, storageKey }: {
  logo: string
  label: string
  groups: NavGroup[]
  mini: boolean
  storageKey: string
}) {
  const [open, setOpen] = usePersistedBool(storageKey, true)
  const allItems = groups.flatMap((g) => g.items)
  if (allItems.length === 0) return null
  if (mini) {
    return (
      <>
        <div className="flex justify-center pt-4 pb-1" title={label}>
          <img src={logo} alt={label} className="h-6 w-6 rounded-full border border-aura-100 bg-white object-contain" />
        </div>
        <NavItems items={allItems} mini />
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
      {open &&
        groups.map((g, i) =>
          g.label === null ? (
            <NavItems key={i} items={g.items} mini={false} />
          ) : (
            <SubGroup key={g.label} label={g.label} items={g.items} storageKey={`${storageKey}-${g.label}`} />
          ),
        )}
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
  const dashItems = visible(DASH_NAV)
  const stockGroups = stockNav(profile)
    .map((g) => ({ ...g, items: visible(g.items) }))
    .filter((g) => g.items.length > 0)
  const claimItems = visible(CLAIM_NAV)
  // Planet'Stock embarque son propre fond : pleine largeur, sans marges.
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

          <AppSection logo={logos.projects} label="Planet’Projects" groups={[{ label: null, items: projectItems.length > 1 ? projectItems : [] }]} mini={collapsed} storageKey="desk-nav-projects" />
          <AppSection logo={logos.dash} label="Planet’Dash" groups={[{ label: null, items: dashItems }]} mini={collapsed} storageKey="desk-nav-dash" />
          <AppSection logo={logos.stock} label="Planet’Stock" groups={stockGroups} mini={collapsed} storageKey="desk-nav-stock" />
          <AppSection logo={logos.claim} label="Planet’Claim" groups={[{ label: null, items: claimItems }]} mini={collapsed} storageKey="desk-nav-claim" />

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
                className={({ isActive }) => `${itemClass(isActive, collapsed)} ${collapsed ? 'mt-3' : ''}`}
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
