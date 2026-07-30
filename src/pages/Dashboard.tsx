import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { computeStats, isCritical } from '../lib/compute'
import { formatDate, isPast } from '../lib/format'
import { update } from '../lib/data'
import { Card, StatTile, EmptyState } from '../components/ui'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { rows: objectives } = useTable('objectives')
  const { rows: tasks } = useTable('tasks')
  const { rows: indicators } = useTable('indicators')
  const { rows: notes } = useTable('notes', undefined, { column: 'updated_at', ascending: false })
  const { rows: notifications, refresh: refreshNotifs } = useTable(
    'notifications',
    profile ? { user_id: profile.id } : undefined,
    { column: 'created_at', ascending: false },
  )

  const myTasks = useMemo(
    () => tasks.filter((t) => t.assignee_id === profile?.id),
    [tasks, profile],
  )
  const myObjectives = useMemo(
    () => objectives.filter((o) => o.owner_id === profile?.id && o.status !== 'termine'),
    [objectives, profile],
  )
  const statsById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeStats>>()
    for (const o of objectives) m.set(o.id, computeStats(o, objectives, tasks, indicators))
    return m
  }, [objectives, tasks, indicators])

  const critical = objectives.filter((o) => {
    const s = statsById.get(o.id)
    return s && isCritical(s, o)
  })
  const toWatch = objectives.filter((o) => {
    const s = statsById.get(o.id)
    return o.status !== 'termine' && s && s.probability < 60 && !isCritical(s, o)
  })

  const in14days = new Date()
  in14days.setDate(in14days.getDate() + 14)
  const horizon = in14days.toISOString().slice(0, 10)
  const upcoming = myTasks
    .filter((t) => t.status !== 'termine' && t.due_date && t.due_date <= horizon)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
  const overdue = upcoming.filter((t) => isPast(t.due_date))

  const unread = notifications.filter((n) => !n.read)

  async function markAllRead() {
    await Promise.all(unread.map((n) => update('notifications', n.id, { read: true })))
    refreshNotifs()
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Tableau de bord</h1>

      <Card title="Que souhaitez-vous faire ?">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Fixer un objectif', to: '/objectifs?nouveau=1', icon: '◎' },
            { label: 'Ajouter une tâche', to: '/objectifs', icon: '☑' },
            { label: 'Prendre des notes', to: '/notes?nouvelle=1', icon: '✎' },
            { label: 'Créer un workflow', to: '/workflows?nouveau=1', icon: '⟳' },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.to)}
              className="flex flex-col items-center gap-2 rounded-lg py-4 hover:bg-aura-50 transition-colors"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-aura-800 text-white text-lg">{a.icon}</span>
              <span className="text-xs font-semibold text-aura-800">{a.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card
            title={<span className="text-coral-600">Notifications importantes</span>}
            action={unread.length > 0 && (
              <button className="text-xs text-aura-700 underline" onClick={markAllRead}>Tout marquer lu</button>
            )}
          >
            {unread.length === 0 ? (
              <p className="text-sm text-aura-700/70">Vous n'avez pas de notification importante en attente.</p>
            ) : (
              <ul className="space-y-2">
                {unread.slice(0, 5).map((n) => (
                  <li key={n.id} className="text-sm border-b border-aura-100 pb-2 last:border-0">{n.message}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Suivi de mon plan d'actions">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatTile label="Mes objectifs" value={myObjectives.length} />
              <StatTile label="Objectifs critiques" value={critical.length} tone={critical.length ? 'alert' : 'default'} />
              <StatTile label="Objectifs à surveiller" value={toWatch.length} />
              <StatTile label="Tâches à faire" value={myTasks.filter((t) => t.status === 'a_faire' || t.status === 'en_cours').length} />
              <StatTile label="Tâches en retard" value={overdue.length} tone={overdue.length ? 'alert' : 'default'} />
              <StatTile label="En attente de validation" value={myTasks.filter((t) => t.status === 'validation').length} />
            </div>
          </Card>

          <Card title="Tâches des 14 prochains jours">
            {upcoming.length === 0 ? (
              <EmptyState>Aucune tâche à échéance dans les 14 prochains jours.</EmptyState>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-head rounded-l-lg">Libellé</th>
                    <th className="table-head rounded-r-lg text-right">Échéance</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((t) => (
                    <tr key={t.id}>
                      <td className={`table-cell ${isPast(t.due_date) ? 'text-coral-600 font-medium' : ''}`}>
                        {t.objective_id ? (
                          <Link to={`/objectifs/${t.objective_id}?onglet=taches`} className="hover:underline">{t.title}</Link>
                        ) : t.title}
                      </td>
                      <td className={`table-cell text-right ${isPast(t.due_date) ? 'text-coral-600 font-semibold' : ''}`}>
                        {formatDate(t.due_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Notes récentes" action={<Link to="/notes" className="text-xs text-aura-700 underline">Voir tout</Link>}>
            {notes.length === 0 ? (
              <EmptyState>Aucune note pour l'instant.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {notes.slice(0, 5).map((n) => (
                  <li key={n.id} className="text-sm border-b border-aura-100 pb-2 last:border-0">
                    <Link to="/notes" className="hover:underline">{n.title}</Link>
                    <span className="text-xs text-aura-700/60"> — {formatDate(n.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Dernières tâches attribuées">
            {myTasks.length === 0 ? (
              <EmptyState>Aucune tâche attribuée.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {[...myTasks]
                  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                  .slice(0, 6)
                  .map((t) => (
                    <li key={t.id} className="text-sm border-b border-aura-100 pb-2 last:border-0">
                      {t.objective_id ? (
                        <Link to={`/objectifs/${t.objective_id}?onglet=taches`} className="hover:underline">{t.title}</Link>
                      ) : t.title}
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card title="Derniers objectifs suivis">
            {myObjectives.length === 0 ? (
              <EmptyState>Aucun objectif dont vous êtes référent.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {myObjectives.slice(0, 5).map((o) => (
                  <li key={o.id} className="text-sm border-b border-aura-100 pb-2 last:border-0">
                    <Link to={`/objectifs/${o.id}`} className="hover:underline">{o.title}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
