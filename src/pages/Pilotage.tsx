import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { computeStats, isCritical, childrenOf } from '../lib/compute'
import { visibleObjectives } from '../lib/permissions'
import { formatDate, profileName } from '../lib/format'
import type { Objective } from '../lib/types'
import { Badge, Card, EmptyState, GaugeRing, ProgressBar } from '../components/ui'

export default function Pilotage() {
  const { profile } = useAuth()
  const [view, setView] = useState<'strategique' | 'operationnel'>('strategique')
  const { rows: allObjectives } = useTable('objectives')
  const { rows: allTasks } = useTable('tasks')
  const { rows: indicators } = useTable('indicators')
  const { rows: profiles } = useTable('profiles')
  const { rows: membersRows } = useTable('objective_members')

  const objectives = useMemo(
    () => visibleObjectives(profile, allObjectives, membersRows, allTasks),
    [profile, allObjectives, membersRows, allTasks],
  )
  const visibleIds = useMemo(() => new Set(objectives.map((o) => o.id)), [objectives])
  const tasks = useMemo(
    () => allTasks.filter((t) => !t.objective_id || visibleIds.has(t.objective_id)),
    [allTasks, visibleIds],
  )

  const statsById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeStats>>()
    for (const o of objectives) m.set(o.id, computeStats(o, allObjectives, allTasks, indicators))
    return m
  }, [objectives, allObjectives, allTasks, indicators])

  const inProgress = objectives.filter((o) => o.status === 'en_cours')
  const notStarted = objectives.filter((o) => o.status === 'non_initie')
  const done = objectives.filter((o) => o.status === 'termine')
  const critical = objectives.filter((o) => {
    const s = statsById.get(o.id)
    return s && isCritical(s, o)
  })

  const totalTasks = tasks.length
  const remaining = tasks.filter((t) => t.status !== 'termine').length
  const today = new Date().toISOString().slice(0, 10)
  const late = tasks.filter((t) => t.status !== 'termine' && t.due_date && t.due_date < today).length
  const toValidate = tasks.filter((t) => t.status === 'validation').length
  const datedDone = tasks.filter((t) => t.status === 'termine' && t.due_date)
  const onTime = datedDone.filter((t) => !t.completed_at || t.completed_at.slice(0, 10) <= t.due_date!).length
  const respectEcheances = datedDone.length ? Math.round((onTime / datedDone.length) * 100) : 100

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-extrabold">Pilotage</h1>
        <div className="flex rounded-full bg-white p-1 shadow-card">
          {([['strategique', '⇗ Pilotage stratégique'], ['operationnel', '◔ Pilotage opérationnel']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${view === key ? 'bg-aura-900 text-white' : 'text-aura-700 hover:bg-aura-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'strategique' ? (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-aura-950 text-white p-5 shadow-card">
              <div className="text-3xl font-extrabold">{inProgress.length} <span className="text-base font-semibold">objectifs en cours</span></div>
              <div className="text-xs text-white/70 mt-1">{notStarted.length} non initié(s) · {done.length} terminé(s)</div>
            </div>
            <div className={`rounded-xl p-5 shadow-card ${critical.length ? 'bg-coral-600 text-white' : 'bg-emerald-600 text-white'}`}>
              <div className="text-3xl font-extrabold">{critical.length} <span className="text-base font-semibold">objectif(s) critique(s)</span></div>
              <div className="text-xs text-white/80 mt-1">
                {critical.length ? 'Retards ou probabilité de résultat faible : à traiter en priorité.' : 'Aucun point de fragilité majeur détecté.'}
              </div>
            </div>
          </div>

          <StrategyMap objectives={objectives} statsById={statsById} />

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {objectives.filter((o) => o.status !== 'termine').map((o) => {
              const s = statsById.get(o.id)!
              return (
                <Card key={o.id} className={isCritical(s, o) ? 'ring-2 ring-coral-500/60' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold leading-snug flex-1">
                      <Link to={`/objectifs/${o.id}`} className="hover:underline">{o.title}</Link>
                    </h3>
                    <GaugeRing value={s.probability} size={52} />
                  </div>
                  <div className="text-[11px] text-aura-700/70 mt-1 mb-3">
                    {formatDate(o.start_date)} – {formatDate(o.due_date)}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center mb-3">
                    <div>
                      <div className="text-[10px] font-semibold text-aura-700">MAÎTRISE</div>
                      <div className={`text-lg font-extrabold ${s.masteryIndex >= 6 ? 'text-emerald-600' : 'text-coral-600'}`}>{s.masteryIndex.toFixed(1)}<span className="text-[10px] text-aura-700">/10</span></div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-aura-700">RÉALITÉ</div>
                      <div className={`text-lg font-extrabold ${s.realityIndex >= 6 ? 'text-emerald-600' : 'text-coral-600'}`}>{s.realityIndex.toFixed(1)}<span className="text-[10px] text-aura-700">/10</span></div>
                    </div>
                  </div>
                  <ProgressBar value={s.completion} />
                  <div className="mt-2 text-[11px] text-aura-700">
                    Probabilité de résultat : <span className="font-bold">{s.probability}%</span>
                    {s.overdueCount > 0 && <span className="text-coral-600 font-semibold"> · {s.overdueCount} retard(s)</span>}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card title="Suivi opérationnel">
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between"><dt>Objectifs en cours</dt><dd className="font-bold">{inProgress.length} /{objectives.length}</dd></div>
                <div className="flex justify-between"><dt>Tâches restantes</dt><dd className="font-bold">{remaining} /{totalTasks}</dd></div>
                <div className="flex justify-between"><dt>Tâches en retard</dt><dd className={`font-bold ${late ? 'text-coral-600' : ''}`}>{late} /{totalTasks}</dd></div>
              </dl>
            </Card>
            <Card title="Performance opérationnelle">
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between"><dt>Respect des échéances</dt><dd className="font-bold">{respectEcheances}%</dd></div>
                <div className="flex justify-between"><dt>Tâches terminées</dt><dd className="font-bold">{totalTasks - remaining}</dd></div>
                <div className="flex justify-between"><dt>Objectifs terminés</dt><dd className="font-bold">{done.length}</dd></div>
              </dl>
            </Card>
            <div className="rounded-xl bg-aura-950 text-white p-5 shadow-card">
              <h2 className="text-sm font-bold mb-2">Validation</h2>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between"><dt className="text-white/80">Tâches à valider</dt><dd className="font-bold">{toValidate}</dd></div>
                <div className="flex justify-between"><dt className="text-white/80">Taux d'avancement global</dt>
                  <dd className="font-bold">{totalTasks ? Math.round(((totalTasks - remaining) / totalTasks) * 100) : 0}%</dd></div>
              </dl>
            </div>
          </div>

          <Card title="Objectifs">
            {objectives.length === 0 ? (
              <EmptyState>Aucun objectif à piloter.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="table-head rounded-l-lg">Libellé</th>
                      <th className="table-head">Échéance</th>
                      <th className="table-head">Référent</th>
                      <th className="table-head w-44">Complétion</th>
                      <th className="table-head rounded-r-lg">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...objectives]
                      .sort((a, b) => ((a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1))
                      .map((o) => {
                        const s = statsById.get(o.id)!
                        return (
                          <tr key={o.id} className="hover:bg-aura-50/60">
                            <td className="table-cell font-medium">
                              <Link to={`/objectifs/${o.id}`} className="hover:underline">{o.title}</Link>
                            </td>
                            <td className="table-cell whitespace-nowrap">{formatDate(o.due_date)}</td>
                            <td className="table-cell whitespace-nowrap">{profileName(profiles, o.owner_id)}</td>
                            <td className="table-cell"><ProgressBar value={s.completion} /></td>
                            <td className="table-cell"><Badge value={o.status} kind="objective" /></td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/** Cartographie : arbre des objectifs avec probabilité de résultat par nœud. */
function StrategyMap({ objectives, statsById }: {
  objectives: Objective[]
  statsById: Map<string, ReturnType<typeof computeStats>>
}) {
  // Un objectif dont le parent n'est pas visible est traité comme racine.
  const idSet = new Set(objectives.map((o) => o.id))
  const roots = objectives.filter((o) => !o.parent_id || !idSet.has(o.parent_id))
  if (roots.length === 0) return null

  // Positionnement simple par niveaux.
  type NodePos = { obj: Objective; x: number; y: number }
  const nodes: NodePos[] = []
  const edges: { from: NodePos; to: NodePos }[] = []
  const levelY = 90
  let leafCursor = 0

  function layout(o: Objective, depth: number): NodePos {
    const children = childrenOf(objectives, o.id)
    let x: number
    if (children.length === 0) {
      x = 80 + leafCursor * 140
      leafCursor += 1
    } else {
      const childPos = children.map((c) => layout(c, depth + 1))
      x = childPos.reduce((s, p) => s + p.x, 0) / childPos.length
      const self: NodePos = { obj: o, x, y: 50 + depth * levelY }
      for (const cp of childPos) edges.push({ from: self, to: cp })
      nodes.push(self)
      return self
    }
    const self: NodePos = { obj: o, x, y: 50 + depth * levelY }
    nodes.push(self)
    return self
  }
  roots.forEach((r) => layout(r, 0))

  const width = Math.max(720, 160 + leafCursor * 140)
  const height = 50 + (Math.max(...nodes.map((n) => n.y)) + 70)

  return (
    <Card title="Cartographie des objectifs">
      <div className="overflow-x-auto">
        <svg width={width} height={height} className="min-w-full">
          {edges.map((e, i) => {
            const critical = statsById.get(e.to.obj.id) && isCritical(statsById.get(e.to.obj.id)!, e.to.obj)
            return (
              <line
                key={i}
                x1={e.from.x} y1={e.from.y + 24} x2={e.to.x} y2={e.to.y - 24}
                stroke={critical ? '#e15750' : '#9db8c9'} strokeWidth={critical ? 2 : 1.2}
              />
            )
          })}
          {nodes.map((n) => {
            const s = statsById.get(n.obj.id)
            const p = s?.probability ?? 0
            const color = n.obj.status === 'termine' ? '#10b981' : p >= 70 ? '#10b981' : p >= 40 ? '#f59e0b' : '#e15750'
            return (
              <g key={n.obj.id}>
                <a href={`/objectifs/${n.obj.id}`}>
                  <circle cx={n.x} cy={n.y} r={24} fill="white" stroke={color} strokeWidth={4} />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0b2e44">
                    {p}%
                  </text>
                  <text x={n.x} y={n.y + 42} textAnchor="middle" fontSize="10" fill="#1d4e6b">
                    {n.obj.title.length > 22 ? n.obj.title.slice(0, 21) + '…' : n.obj.title}
                  </text>
                </a>
              </g>
            )
          })}
        </svg>
      </div>
    </Card>
  )
}
