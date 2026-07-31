import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/format'
import { Card, EmptyState } from '../components/ui'

const APP_LABELS: Record<string, string> = {
  projects: "Planet'Projects",
  dash: "Planet'Dash",
  stock: "Planet'Stock",
  chat: 'Chat interne',
  documents: 'Documents',
  liens: 'Liens & outils',
  calendrier: 'Calendrier',
  claim: "Planet'Claim",
  administration: 'Administration',
  desk: 'Desk',
}

const APP_BADGES: Record<string, string> = {
  projects: 'bg-accent-500/10 text-accent-500',
  dash: 'bg-cyan-100 text-cyan-800',
  stock: 'bg-purple-100 text-purple-800',
  chat: 'bg-sky-100 text-sky-800',
  documents: 'bg-emerald-100 text-emerald-800',
  liens: 'bg-amber-100 text-amber-800',
  calendrier: 'bg-teal-100 text-teal-800',
  claim: 'bg-indigo-100 text-indigo-800',
  administration: 'bg-aura-100 text-aura-800',
  desk: 'bg-aura-100 text-aura-800',
}

interface Entry {
  id: string
  created_at: string
  user_name: string
  app: string
  action: string
}

/** Journal d'activité global : qui a fait quoi, filtrable par sous-app. */
export default function JournalPage() {
  const { profile } = useAuth()
  const [appFilter, setAppFilter] = useState('')
  const [person, setPerson] = useState('')
  const [search, setSearch] = useState('')
  const [stockEntries, setStockEntries] = useState<Entry[]>([])

  const { rows: auditRows } = useTable('audit_log', undefined, { column: 'created_at', ascending: false })

  // Le module stock tient son journal dans son état applicatif (table
  // app_state, hors couche typée) : on le fusionne ici pour une vue unique.
  useEffect(() => {
    if (!supabase) return
    supabase
      .from('app_state')
      .select('value')
      .eq('key', 'pa-stock-clean2')
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.value as { auditLog?: { date: string; user: string; module: string; action: string }[] } | undefined
        const log = value?.auditLog ?? []
        setStockEntries(
          log.map((e, i) => ({
            id: `stock-${i}`,
            created_at: e.date,
            user_name: e.user,
            app: 'stock',
            action: e.module && !e.action.startsWith(e.module) ? `${e.module} — ${e.action}` : e.action,
          })),
        )
      })
  }, [])

  const entries = useMemo(() => {
    const all: Entry[] = [
      ...auditRows.map((r) => ({ id: r.id, created_at: r.created_at, user_name: r.user_name, app: r.app, action: r.action })),
      ...stockEntries,
    ]
    all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    const q = search.trim().toLowerCase()
    return all.filter(
      (e) =>
        (!appFilter || e.app === appFilter) &&
        (!person || e.user_name === person) &&
        (!q || e.action.toLowerCase().includes(q) || e.user_name.toLowerCase().includes(q)),
    )
  }, [auditRows, stockEntries, appFilter, person, search])

  const people = useMemo(
    () => [...new Set([...auditRows.map((r) => r.user_name), ...stockEntries.map((e) => e.user_name)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr')),
    [auditRows, stockEntries],
  )

  if (profile?.role !== 'admin') {
    return <p className="text-aura-700">Cette page est réservée aux administrateurs.</p>
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Journal d'activité</h1>
        <p className="text-sm text-aura-700/80 mt-1">
          Qui a fait quoi, dans toute l'application. Les actions sont enregistrées automatiquement
          (créations, modifications, suppressions), y compris dans Planet'Stock.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <select className="input max-w-52" value={appFilter} onChange={(e) => setAppFilter(e.target.value)}>
            <option value="">Toutes les applications</option>
            {Object.entries(APP_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="input max-w-52" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Tout le monde</option>
            {people.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input
            className="input max-w-xs"
            placeholder="Rechercher une action…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {entries.length === 0 ? (
          <EmptyState>
            Aucune activité enregistrée{appFilter ? ` pour ${APP_LABELS[appFilter]}` : ''}. Les actions
            apparaissent ici au fur et à mesure de l'utilisation.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg w-36">Date</th>
                  <th className="table-head w-44">Salarié</th>
                  <th className="table-head w-36">Application</th>
                  <th className="table-head rounded-r-lg">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 300).map((e) => (
                  <tr key={e.id} className="hover:bg-aura-50/60">
                    <td className="table-cell whitespace-nowrap text-xs text-aura-700">{formatDateTime(e.created_at)}</td>
                    <td className="table-cell font-medium">{e.user_name || '—'}</td>
                    <td className="table-cell">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${APP_BADGES[e.app] ?? 'bg-aura-100 text-aura-800'}`}>
                        {APP_LABELS[e.app] ?? e.app}
                      </span>
                    </td>
                    <td className="table-cell text-sm">{e.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length > 300 && (
              <p className="text-xs text-aura-700/60 mt-2">Affichage des 300 actions les plus récentes ({entries.length} au total) — affinez avec les filtres.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
