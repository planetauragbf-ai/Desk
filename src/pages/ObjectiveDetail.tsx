import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { computeStats, descendantsOf } from '../lib/compute'
import { visibleObjectives } from '../lib/permissions'
import { formatDate, isPast, profileName, TASK_STATUS_LABELS } from '../lib/format'
import { insert, remove, update } from '../lib/data'
import type { Decision, DocumentMeta, Indicator, Note, Priority, Task, TaskStatus } from '../lib/types'
import { Badge, Card, EmptyState, GaugeRing, Modal, ProgressBar } from '../components/ui'

const TABS = [
  { key: 'synthese', label: 'Synthèse' },
  { key: 'plan', label: "Plan d'actions" },
  { key: 'taches', label: 'Tâches' },
  { key: 'notes', label: 'Notes' },
  { key: 'documents', label: 'Documents' },
  { key: 'decisions', label: 'Décisions' },
  { key: 'indicateurs', label: 'Indicateurs' },
] as const

export default function ObjectiveDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('onglet') ?? 'synthese'

  const { rows: objectives, refresh: refreshObjectives } = useTable('objectives')
  const { rows: allTasks, refresh: refreshTasks } = useTable('tasks')
  const { rows: indicators, refresh: refreshIndicators } = useTable('indicators')
  const { rows: profiles } = useTable('profiles')
  const { rows: notes, refresh: refreshNotes } = useTable('notes', undefined, { column: 'updated_at', ascending: false })
  const { rows: documents, refresh: refreshDocs } = useTable('documents', undefined, { column: 'created_at', ascending: false })
  const { rows: decisions, refresh: refreshDecisions } = useTable('decisions', undefined, { column: 'created_at', ascending: false })
  const { rows: membersRows } = useTable('objective_members')
  const { rows: templates } = useTable('workflow_templates')
  const { rows: steps } = useTable('workflow_steps', undefined, { column: 'position', ascending: true })
  const { rows: actions } = useTable('workflow_actions', undefined, { column: 'position', ascending: true })

  const objective = objectives.find((o) => o.id === id)
  const stats = useMemo(
    () => (objective ? computeStats(objective, objectives, allTasks, indicators) : null),
    [objective, objectives, allTasks, indicators],
  )

  if (!objective || !stats) {
    return <p className="text-aura-700">Objectif introuvable. <Link to="/objectifs" className="underline">Retour aux objectifs</Link></p>
  }

  const allowed = visibleObjectives(profile, objectives, membersRows, allTasks).some((o) => o.id === objective.id)
  if (!allowed) {
    return (
      <p className="text-aura-700">
        Vous n'avez pas accès à ce projet. <Link to="/objectifs" className="underline">Retour aux objectifs</Link>
      </p>
    )
  }

  const children = objectives.filter((o) => o.parent_id === objective.id)
  const parent = objectives.find((o) => o.id === objective.parent_id)
  const directTasks = allTasks.filter((t) => t.objective_id === objective.id)
  const objNotes = notes.filter((n) => n.objective_id === objective.id)
  const objDocs = documents.filter((d) => d.objective_id === objective.id)
  const objDecisions = decisions.filter((d) => d.objective_id === objective.id)
  const objIndicators = indicators.filter((i) => i.objective_id === objective.id)

  async function toggleClose() {
    const done = objective!.status === 'termine'
    await update('objectives', objective!.id, {
      status: done ? 'en_cours' : 'termine',
      closed_at: done ? null : new Date().toISOString(),
    })
    refreshObjectives()
  }

  async function deleteObjective() {
    const scope = [objective!, ...descendantsOf(objectives, objective!.id)]
    const label = scope.length > 1 ? `ses ${scope.length - 1} sous-objectif(s) et ` : ''
    if (!confirm(`Supprimer définitivement « ${objective!.title} », ${label}toutes les données liées (tâches, notes, documents, décisions, indicateurs) ?`)) return
    const ids = new Set(scope.map((o) => o.id))
    for (const t of allTasks.filter((t) => t.objective_id && ids.has(t.objective_id))) await remove('tasks', t.id)
    for (const n of notes.filter((n) => n.objective_id && ids.has(n.objective_id))) await remove('notes', n.id)
    for (const d of documents.filter((d) => d.objective_id && ids.has(d.objective_id))) await remove('documents', d.id)
    for (const d of decisions.filter((d) => d.objective_id && ids.has(d.objective_id))) await remove('decisions', d.id)
    for (const i of indicators.filter((i) => ids.has(i.objective_id))) await remove('indicators', i.id)
    for (const m of membersRows.filter((m) => ids.has(m.objective_id))) await remove('objective_members', m.id)
    for (const o of [...scope].reverse()) await remove('objectives', o.id)
    navigate('/objectifs')
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="rounded-xl bg-aura-900 text-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
              aria-label="Retour"
            >←</button>
            <h1 className="text-lg font-bold truncate">{objective.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs whitespace-nowrap cursor-pointer">
              Clore l'objectif
              <input type="checkbox" checked={objective.status === 'termine'} onChange={toggleClose} />
            </label>
            {profile?.role === 'admin' && (
              <button
                onClick={deleteObjective}
                className="text-xs text-white/70 hover:text-coral-500 whitespace-nowrap"
                title="Supprimer définitivement cet objectif"
              >🗑 Supprimer</button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/80">
          <Badge value={objective.status} kind="objective" />
          <Badge value={objective.priority} kind="priority" />
          <span>Créé le {formatDate(objective.created_at)}{objective.created_by ? ` par ${profileName(profiles, objective.created_by)}` : ''}</span>
          <span>Démarrage : {formatDate(objective.start_date)}</span>
          <span>Échéance : {formatDate(objective.due_date)}</span>
          <span>Référent : {profileName(profiles, objective.owner_id)}</span>
          <div className="w-52 ml-auto"><ProgressBar value={stats.completion} /></div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-card w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ onglet: t.key })}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-aura-900 text-white' : 'text-aura-700 hover:bg-aura-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'synthese' && (
        <SyntheseTab
          objective={objective} stats={stats} parent={parent} children={children}
          directTasks={directTasks} refreshObjectives={refreshObjectives} profiles={profiles}
        />
      )}
      {tab === 'plan' && (
        <PlanTab
          objectiveId={objective.id} children={children} objectives={objectives}
          allTasks={allTasks} indicators={indicators} directTasks={directTasks} profiles={profiles}
          templates={templates} steps={steps} actions={actions}
          refreshTasks={refreshTasks} refreshObjectives={refreshObjectives}
        />
      )}
      {tab === 'taches' && (
        <TasksTab objectiveId={objective.id} tasks={directTasks} profiles={profiles} refresh={refreshTasks} />
      )}
      {tab === 'notes' && (
        <NotesTab objectiveId={objective.id} notes={objNotes} profiles={profiles} authorId={profile?.id ?? null} refresh={refreshNotes} />
      )}
      {tab === 'documents' && (
        <DocumentsTab objectiveId={objective.id} docs={objDocs} authorId={profile?.id ?? null} refresh={refreshDocs} />
      )}
      {tab === 'decisions' && (
        <DecisionsTab objectiveId={objective.id} decisions={objDecisions} profiles={profiles} deciderId={profile?.id ?? null} refresh={refreshDecisions} />
      )}
      {tab === 'indicateurs' && (
        <IndicatorsTab objectiveId={objective.id} indicators={objIndicators} refresh={refreshIndicators} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Synthèse

function SyntheseTab({ objective, stats, parent, children, directTasks, refreshObjectives, profiles }: {
  objective: import('../lib/types').Objective
  stats: ReturnType<typeof computeStats>
  parent?: import('../lib/types').Objective
  children: import('../lib/types').Objective[]
  directTasks: Task[]
  refreshObjectives: () => void
  profiles: import('../lib/types').Profile[]
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(objective.expected_result)

  async function saveExpected() {
    await update('objectives', objective.id, { expected_result: text })
    setEditing(false)
    refreshObjectives()
  }

  const upcoming = directTasks
    .filter((t) => t.status !== 'termine' && t.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 6)

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <Card
          title="⊕ Attendu / livrable"
          action={
            <button className="text-xs text-aura-700 underline" onClick={() => (editing ? saveExpected() : setEditing(true))}>
              {editing ? 'Enregistrer' : 'Modifier'}
            </button>
          }
        >
          {editing ? (
            <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <p className="text-sm text-aura-800 whitespace-pre-wrap">
              {objective.expected_result || 'Décrivez le résultat concret attendu pour cet objectif.'}
            </p>
          )}
        </Card>

        <Card title="☀ Suivi du plan d'actions">
          <div className="flex items-center justify-around mb-4">
            <div className="text-center">
              <div className="text-[11px] font-semibold text-aura-700">Indice de réalité</div>
              <div className={`text-2xl font-extrabold ${stats.realityIndex >= 6 ? 'text-emerald-600' : 'text-coral-600'}`}>
                {stats.realityIndex.toFixed(2)}<span className="text-xs text-aura-700">/10</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[11px] font-semibold text-aura-700">Indice de maîtrise</div>
              <div className={`text-2xl font-extrabold ${stats.masteryIndex >= 6 ? 'text-emerald-600' : 'text-coral-600'}`}>
                {stats.masteryIndex.toFixed(2)}<span className="text-xs text-aura-700">/10</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[11px] font-semibold text-aura-700">Probabilité de résultat</div>
              <GaugeRing value={stats.probability} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Sous-objectifs', String(children.length)],
              ['Tâches restantes', `${stats.taskCount - stats.doneCount}/${stats.taskCount}`],
              ['Validations en attente', String(stats.pendingValidation)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-aura-100/70 px-3 py-2.5">
                <div className="text-[11px] font-semibold text-aura-700">{label}</div>
                <div className="text-lg font-extrabold">{value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="⧉ Objectifs liés">
          <div className="text-sm space-y-2">
            <div>
              <div className="text-xs font-bold text-aura-700 mb-1">Objectif(s) parent(s)</div>
              {parent ? (
                <Link to={`/objectifs/${parent.id}`} className="hover:underline">{parent.title}</Link>
              ) : <span className="text-aura-700/60">(aucune relation)</span>}
            </div>
            <div>
              <div className="text-xs font-bold text-aura-700 mb-1">Objectif(s) enfant(s)</div>
              {children.length === 0 ? <span className="text-aura-700/60">(aucune relation)</span> : (
                <ul className="space-y-1">
                  {children.map((c) => (
                    <li key={c.id}><Link to={`/objectifs/${c.id}`} className="hover:underline">{c.title}</Link></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="◔ Échéances à venir">
          {upcoming.length === 0 ? (
            <EmptyState>Aucune échéance à venir sur les tâches directes.</EmptyState>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg">Échéance</th>
                  <th className="table-head">Libellé</th>
                  <th className="table-head rounded-r-lg">Référent</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((t) => (
                  <tr key={t.id}>
                    <td className={`table-cell whitespace-nowrap ${isPast(t.due_date) ? 'text-coral-600 font-semibold' : ''}`}>{formatDate(t.due_date)}</td>
                    <td className="table-cell">{t.title}</td>
                    <td className="table-cell whitespace-nowrap">{profileName(profiles, t.assignee_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="◎ Moyens et risques">
          <p className="text-sm text-aura-700/80 mb-3">
            Lecture rapide du cadrage : plus l'indice de maîtrise est élevé, plus le périmètre
            (échéances, attributions, indicateurs) est sous contrôle.
          </p>
          <ul className="text-sm space-y-1.5">
            <li>· {stats.overdueCount} tâche(s) en retard sur le périmètre</li>
            <li>· {stats.taskCount === 0 ? "Aucun plan d'actions défini — objectif à cadrer" : `${stats.taskCount} tâche(s) au plan d'actions consolidé`}</li>
            <li>· {objective.due_date ? `Échéance posée au ${formatDate(objective.due_date)}` : 'Aucune échéance posée sur cet objectif'}</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Plan d'actions

function PlanTab({ objectiveId, children, objectives, allTasks, indicators, directTasks, profiles, templates, steps, actions, refreshTasks, refreshObjectives }: {
  objectiveId: string
  children: import('../lib/types').Objective[]
  objectives: import('../lib/types').Objective[]
  allTasks: Task[]
  indicators: Indicator[]
  directTasks: Task[]
  profiles: import('../lib/types').Profile[]
  templates: import('../lib/types').WorkflowTemplate[]
  steps: import('../lib/types').WorkflowStep[]
  actions: import('../lib/types').WorkflowAction[]
  refreshTasks: () => void
  refreshObjectives: () => void
}) {
  const [applying, setApplying] = useState(false)
  const [showSub, setShowSub] = useState(false)
  const groups = [...new Set(directTasks.filter((t) => t.workflow_group).map((t) => t.workflow_group!))]

  async function applyTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const templateId = String(new FormData(e.currentTarget).get('template_id'))
    if (!templateId) return
    const tplSteps = steps.filter((s) => s.template_id === templateId).sort((a, b) => a.position - b.position)
    for (const step of tplSteps) {
      const stepActions = actions.filter((a) => a.step_id === step.id).sort((a, b) => a.position - b.position)
      for (const action of stepActions) {
        await insert('tasks', {
          objective_id: objectiveId,
          title: action.title,
          status: 'a_faire',
          priority: 'moyenne',
          workflow_group: step.title,
        } as Partial<Task>)
      }
    }
    await update('workflow_templates', templateId, { status: 'utilisee', updated_at: new Date().toISOString() })
    setApplying(false)
    refreshTasks()
  }

  async function createSub(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await insert('objectives', {
      title: String(fd.get('title')),
      parent_id: objectiveId,
      status: 'non_initie',
      priority: 'moyenne',
      due_date: String(fd.get('due_date')) || null,
      owner_id: String(fd.get('owner_id')) || null,
    } as Partial<import('../lib/types').Objective>)
    setShowSub(false)
    refreshObjectives()
  }

  return (
    <div className="space-y-5">
      <Card title="⧉ Sous-objectifs" action={<button className="text-lg text-aura-700" onClick={() => setShowSub(true)} aria-label="Ajouter un sous-objectif">+</button>}>
        {children.length === 0 ? (
          <EmptyState>Décomposez cet objectif en sous-objectifs pour structurer le plan d'actions.</EmptyState>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head rounded-l-lg">Échéance</th>
                <th className="table-head">Libellé</th>
                <th className="table-head">Référent</th>
                <th className="table-head rounded-r-lg w-44">Complétion</th>
              </tr>
            </thead>
            <tbody>
              {children.map((c) => {
                const s = computeStats(c, objectives, allTasks, indicators)
                return (
                  <tr key={c.id} className="hover:bg-aura-50/60">
                    <td className="table-cell whitespace-nowrap">{formatDate(c.due_date)}</td>
                    <td className="table-cell"><Link to={`/objectifs/${c.id}`} className="hover:underline font-medium">{c.title}</Link></td>
                    <td className="table-cell whitespace-nowrap">{profileName(profiles, c.owner_id)}</td>
                    <td className="table-cell"><ProgressBar value={s.completion} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="◔ Les tâches directes">
          {directTasks.filter((t) => !t.workflow_group).length === 0 ? (
            <EmptyState>Aucune tâche directe. Ajoutez-en depuis l'onglet Tâches.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {directTasks.filter((t) => !t.workflow_group).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 border-b border-aura-100 pb-2 last:border-0 text-sm">
                  <span className={t.status === 'termine' ? 'line-through text-aura-700/50' : ''}>{t.title}</span>
                  <span className={`text-xs whitespace-nowrap ${isPast(t.due_date) && t.status !== 'termine' ? 'text-coral-600 font-semibold' : 'text-aura-700'}`}>
                    {formatDate(t.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="⟳ Les workflows" action={<button className="text-xs text-aura-700 underline" onClick={() => setApplying(true)}>Importer un workflow</button>}>
          {groups.length === 0 ? (
            <EmptyState>Aucun workflow appliqué. Importez un template pour dérouler un processus éprouvé.</EmptyState>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const groupTasks = directTasks.filter((t) => t.workflow_group === g)
                const done = groupTasks.filter((t) => t.status === 'termine').length
                return (
                  <div key={g}>
                    <div className="flex items-center justify-between text-sm font-semibold mb-1">
                      <span>Étape · {g}</span>
                      <span className="text-xs text-aura-700">{done}/{groupTasks.length}</span>
                    </div>
                    <ProgressBar value={groupTasks.length ? (done / groupTasks.length) * 100 : 0} />
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {applying && (
        <Modal title="Importer un workflow" onClose={() => setApplying(false)}>
          {templates.length === 0 ? (
            <p className="text-sm text-aura-700">
              Aucun template disponible. <Link to="/workflows" className="underline">Créez d'abord un workflow</Link>.
            </p>
          ) : (
            <form onSubmit={applyTemplate} className="space-y-3">
              <div>
                <label className="label">Template</label>
                <select name="template_id" className="input" required defaultValue="">
                  <option value="" disabled>Choisir un workflow…</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <p className="text-xs text-aura-700/70">
                Chaque action du template devient une tâche de cet objectif, regroupée par étape.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setApplying(false)}>Annuler</button>
                <button type="submit" className="btn-primary">Importer</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {showSub && (
        <Modal title="Ajouter un sous-objectif" onClose={() => setShowSub(false)}>
          <form onSubmit={createSub} className="space-y-3">
            <div>
              <label className="label">Libellé *</label>
              <input name="title" className="input" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Échéance</label>
                <input type="date" name="due_date" className="input" />
              </div>
              <div>
                <label className="label">Référent</label>
                <select name="owner_id" className="input" defaultValue="">
                  <option value="">—</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowSub(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Tâches

function TasksTab({ objectiveId, tasks, profiles, refresh }: {
  objectiveId: string
  tasks: Task[]
  profiles: import('../lib/types').Profile[]
  refresh: () => void
}) {
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [search, setSearch] = useState('')

  const filtered = tasks
    .filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => ((a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1))

  async function setStatus(t: Task, status: TaskStatus) {
    await update('tasks', t.id, {
      status,
      completed_at: status === 'termine' ? new Date().toISOString() : null,
    })
    refresh()
  }

  async function removeTask(t: Task) {
    if (!confirm(`Supprimer la tâche « ${t.title} » ?`)) return
    await remove('tasks', t.id)
    refresh()
  }

  function doerLabel(t: Task) {
    if ((t.assigned_kind ?? 'salarie') === 'client') {
      return (
        <span className="whitespace-nowrap">
          {t.external_name || 'Externe'}
          <span className="ml-1.5 text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 font-semibold">Client</span>
        </span>
      )
    }
    return profileName(profiles, t.assignee_id)
  }

  return (
    <Card title="◔ Tâches" action={<button className="btn-primary" onClick={() => setEditing('new')}>+ Ajouter une tâche</button>}>
      <input className="input max-w-xs mb-3" placeholder="Rechercher une tâche…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 ? (
        <EmptyState>Aucune tâche sur cet objectif.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr>
                <th className="table-head rounded-l-lg w-8"></th>
                <th className="table-head">Échéance</th>
                <th className="table-head">Libellé</th>
                <th className="table-head">Qui fait</th>
                <th className="table-head">Statut</th>
                <th className="table-head">Priorité</th>
                <th className="table-head rounded-r-lg w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-aura-50/60">
                  <td className="table-cell">
                    <input
                      type="checkbox"
                      checked={t.status === 'termine'}
                      onChange={() => setStatus(t, t.status === 'termine' ? 'a_faire' : 'termine')}
                      aria-label="Terminer la tâche"
                    />
                  </td>
                  <td className={`table-cell whitespace-nowrap ${isPast(t.due_date) && t.status !== 'termine' ? 'text-coral-600 font-semibold' : ''}`}>
                    {formatDate(t.due_date)}
                  </td>
                  <td className="table-cell">
                    <button className="text-left hover:underline" onClick={() => setEditing(t)}>
                      <span className={t.status === 'termine' ? 'line-through text-aura-700/50' : 'font-medium'}>{t.title}</span>
                    </button>
                    {t.workflow_group && <span className="ml-2 text-[10px] rounded bg-aura-100 px-1.5 py-0.5 text-aura-700">{t.workflow_group}</span>}
                  </td>
                  <td className="table-cell">{doerLabel(t)}</td>
                  <td className="table-cell">
                    <select
                      className="rounded-md border border-aura-200 text-xs px-1.5 py-1 bg-white"
                      value={t.status}
                      onChange={(e) => setStatus(t, e.target.value as TaskStatus)}
                    >
                      {Object.entries(TASK_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="table-cell"><Badge value={t.priority} kind="priority" /></td>
                  <td className="table-cell whitespace-nowrap">
                    <button className="text-aura-700/60 hover:text-aura-950 mr-2" onClick={() => setEditing(t)} aria-label="Modifier">✎</button>
                    <button className="text-aura-700/60 hover:text-coral-600" onClick={() => removeTask(t)} aria-label="Supprimer">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TaskEditModal
          key={editing === 'new' ? 'new' : editing.id}
          objectiveId={objectiveId}
          task={editing === 'new' ? null : editing}
          profiles={profiles}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </Card>
  )
}

function TaskEditModal({ objectiveId, task, profiles, onClose, onSaved }: {
  objectiveId: string
  task: Task | null
  profiles: import('../lib/types').Profile[]
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<'salarie' | 'client'>(task?.assigned_kind ?? 'salarie')
  const { rows: allDocs, refresh: refreshDocs } = useTable('documents', undefined, { column: 'created_at', ascending: false })
  const taskDocs = task ? allDocs.filter((d) => d.task_id === task.id) : []

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload: Partial<Task> = {
      title: String(fd.get('title')),
      description: String(fd.get('description') ?? ''),
      priority: String(fd.get('priority')) as Priority,
      due_date: String(fd.get('due_date')) || null,
      assigned_kind: kind,
      assignee_id: kind === 'salarie' ? String(fd.get('assignee_id')) || null : null,
      external_name: kind === 'client' ? String(fd.get('external_name')) || null : null,
    }
    if (task) {
      await update('tasks', task.id, payload)
    } else {
      await insert('tasks', { ...payload, objective_id: objectiveId, status: 'a_faire' } as Partial<Task>)
    }
    onSaved()
  }

  async function addDoc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!task) return
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('doc_name')).trim()
    if (!name) return
    await insert('documents', {
      name,
      folder: 'Projets',
      url: String(fd.get('doc_url')) || null,
      objective_id: objectiveId,
      task_id: task.id,
    } as Partial<import('../lib/types').DocumentMeta>)
    e.currentTarget.reset()
    refreshDocs()
  }

  return (
    <Modal title={task ? 'Modifier la tâche' : 'Ajouter une tâche'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label">Libellé *</label>
          <input name="title" className="input" required defaultValue={task?.title ?? ''} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea name="description" className="input" rows={3} defaultValue={task?.description ?? ''} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Échéance</label>
            <input type="date" name="due_date" className="input" defaultValue={task?.due_date ?? ''} />
          </div>
          <div>
            <label className="label">Priorité</label>
            <select name="priority" className="input" defaultValue={task?.priority ?? 'moyenne'}>
              <option value="basse">Basse</option>
              <option value="moyenne">Moyenne</option>
              <option value="haute">Haute</option>
              <option value="critique">Critique</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Qui fait ?</label>
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="kind" checked={kind === 'salarie'} onChange={() => setKind('salarie')} />
              Salarié
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="kind" checked={kind === 'client'} onChange={() => setKind('client')} />
              Client / externe
            </label>
          </div>
          {kind === 'salarie' ? (
            <select name="assignee_id" className="input" defaultValue={task?.assignee_id ?? ''}>
              <option value="">—</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          ) : (
            <input
              name="external_name"
              className="input"
              placeholder="Nom du client / partenaire (ex. : GL Events, KUNG…)"
              defaultValue={task?.external_name ?? ''}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary">{task ? 'Enregistrer' : 'Créer la tâche'}</button>
        </div>
      </form>

      {task && (
        <div className="mt-5 border-t border-aura-100 pt-4">
          <h4 className="text-sm font-bold mb-2">▤ Documents de la tâche</h4>
          {taskDocs.length === 0 ? (
            <p className="text-xs text-aura-700/60 mb-2">Aucun document joint.</p>
          ) : (
            <ul className="space-y-1.5 mb-3">
              {taskDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm rounded bg-aura-50 px-3 py-1.5">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-accent-500 hover:underline truncate">{d.name}</a>
                  ) : <span className="truncate">{d.name}</span>}
                  <button
                    className="text-aura-700/50 hover:text-coral-600 text-xs ml-2"
                    onClick={async () => { await remove('documents', d.id); refreshDocs() }}
                    aria-label="Retirer le document"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addDoc} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input name="doc_name" className="input" placeholder="Nom du document *" required />
            <input name="doc_url" className="input" placeholder="Lien (URL, optionnel)" />
            <button type="submit" className="btn-secondary">Joindre</button>
          </form>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Notes

function NotesTab({ objectiveId, notes, profiles, authorId, refresh }: {
  objectiveId: string
  notes: Note[]
  profiles: import('../lib/types').Profile[]
  authorId: string | null
  refresh: () => void
}) {
  const [showNew, setShowNew] = useState(false)

  async function createNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const now = new Date().toISOString()
    await insert('notes', {
      title: String(fd.get('title')),
      content: String(fd.get('content') ?? ''),
      objective_id: objectiveId,
      author_id: authorId,
      shared: true,
      created_at: now,
      updated_at: now,
    } as Partial<Note>)
    setShowNew(false)
    refresh()
  }

  return (
    <Card title="✎ Notes partagées" action={<button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter une note</button>}>
      {notes.length === 0 ? (
        <EmptyState>Aucune note sur cet objectif. Les notes gardent le fil des échanges au même endroit.</EmptyState>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <article key={n.id} className="rounded-lg border border-aura-100 p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="text-sm font-bold">{n.title}</h3>
                <button
                  className="text-xs text-aura-700/60 hover:text-coral-600"
                  onClick={async () => { if (confirm('Supprimer cette note ?')) { await remove('notes', n.id); refresh() } }}
                >Supprimer</button>
              </div>
              <p className="text-sm text-aura-800 whitespace-pre-wrap">{n.content}</p>
              <p className="text-[11px] text-aura-700/60 mt-2">
                {profileName(profiles, n.author_id)} — {formatDate(n.updated_at)}
              </p>
            </article>
          ))}
        </div>
      )}

      {showNew && (
        <Modal title="Ajouter une note" onClose={() => setShowNew(false)}>
          <form onSubmit={createNote} className="space-y-3">
            <div>
              <label className="label">Titre *</label>
              <input name="title" className="input" required />
            </div>
            <div>
              <label className="label">Contenu</label>
              <textarea name="content" className="input" rows={5} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Documents

function DocumentsTab({ objectiveId, docs, authorId, refresh }: {
  objectiveId: string
  docs: DocumentMeta[]
  authorId: string | null
  refresh: () => void
}) {
  const [showNew, setShowNew] = useState(false)

  async function createDoc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await insert('documents', {
      name: String(fd.get('name')),
      folder: String(fd.get('folder') || 'Général'),
      url: String(fd.get('url')) || null,
      objective_id: objectiveId,
      author_id: authorId,
    } as Partial<DocumentMeta>)
    setShowNew(false)
    refresh()
  }

  return (
    <Card title="▤ Documents" action={<button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter un document</button>}>
      {docs.length === 0 ? (
        <EmptyState>Aucun document rattaché à cet objectif.</EmptyState>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head rounded-l-lg">Nom</th>
              <th className="table-head">Dossier</th>
              <th className="table-head">Ajout</th>
              <th className="table-head rounded-r-lg w-10"></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="hover:bg-aura-50/60">
                <td className="table-cell font-medium">
                  {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent-500 hover:underline">{d.name}</a> : d.name}
                </td>
                <td className="table-cell">{d.folder}</td>
                <td className="table-cell whitespace-nowrap">{formatDate(d.created_at)}</td>
                <td className="table-cell">
                  <button
                    className="text-aura-700/60 hover:text-coral-600"
                    onClick={async () => { if (confirm('Supprimer ce document ?')) { await remove('documents', d.id); refresh() } }}
                    aria-label="Supprimer"
                  >🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <Modal title="Ajouter un document" onClose={() => setShowNew(false)}>
          <form onSubmit={createDoc} className="space-y-3">
            <div>
              <label className="label">Nom *</label>
              <input name="name" className="input" required placeholder="Ex. : Cahier des charges v2.pdf" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Dossier</label>
                <select name="folder" className="input" defaultValue="Général">
                  {['Général', 'Projets', 'CR réunions', 'Contrats', 'Directives', 'Personnel'].map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Lien (URL)</label>
                <input name="url" className="input" placeholder="https://…" />
              </div>
            </div>
            <p className="text-xs text-aura-700/70">
              Renseignez un lien (Drive, SharePoint…) ; le fichier reste hébergé chez vous.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Ajouter</button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Décisions

function DecisionsTab({ objectiveId, decisions, profiles, deciderId, refresh }: {
  objectiveId: string
  decisions: Decision[]
  profiles: import('../lib/types').Profile[]
  deciderId: string | null
  refresh: () => void
}) {
  const [showNew, setShowNew] = useState(false)
  const [arbitrating, setArbitrating] = useState<Decision | null>(null)

  async function createDecision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await insert('decisions', {
      objective_id: objectiveId,
      title: String(fd.get('title')),
      context: String(fd.get('context') ?? ''),
      status: 'a_instruire',
      outcome: '',
    } as Partial<Decision>)
    setShowNew(false)
    refresh()
  }

  async function arbitrate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!arbitrating) return
    const fd = new FormData(e.currentTarget)
    await update('decisions', arbitrating.id, {
      status: 'arbitree',
      outcome: String(fd.get('outcome')),
      decided_by: deciderId,
      decided_at: new Date().toISOString(),
    })
    setArbitrating(null)
    refresh()
  }

  const columns: { status: Decision['status']; title: string }[] = [
    { status: 'a_instruire', title: 'À instruire' },
    { status: 'en_instruction', title: 'En instruction' },
    { status: 'arbitree', title: 'Arbitrées' },
  ]

  return (
    <Card title="⚖ Décisions" action={<button className="btn-primary" onClick={() => setShowNew(true)}>+ Mettre à l'étude</button>}>
      <div className="grid md:grid-cols-3 gap-4">
        {columns.map((col) => (
          <div key={col.status} className="rounded-lg bg-aura-50 p-3">
            <h3 className="text-xs font-bold text-aura-700 mb-2">{col.title}</h3>
            <div className="space-y-2">
              {decisions.filter((d) => d.status === col.status).map((d) => (
                <div key={d.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="text-sm font-semibold">{d.title}</div>
                  {d.context && <p className="text-xs text-aura-700/80 mt-1">{d.context}</p>}
                  {d.status === 'arbitree' ? (
                    <div className="mt-2 text-xs">
                      <span className="font-semibold text-emerald-700">Arbitrage :</span> {d.outcome || '—'}
                      <div className="text-aura-700/60 mt-1">
                        {profileName(profiles, d.decided_by)} — {formatDate(d.decided_at)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      {d.status === 'a_instruire' && (
                        <button
                          className="text-xs underline text-aura-700"
                          onClick={async () => { await update('decisions', d.id, { status: 'en_instruction' }); refresh() }}
                        >Instruire</button>
                      )}
                      <button className="text-xs underline text-emerald-700" onClick={() => setArbitrating(d)}>Arbitrer</button>
                      <button
                        className="text-xs underline text-coral-600 ml-auto"
                        onClick={async () => { if (confirm('Supprimer cette décision ?')) { await remove('decisions', d.id); refresh() } }}
                      >Supprimer</button>
                    </div>
                  )}
                </div>
              ))}
              {decisions.filter((d) => d.status === col.status).length === 0 && (
                <p className="text-xs text-aura-700/50 py-2 text-center">—</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <Modal title="Mettre une décision à l'étude" onClose={() => setShowNew(false)}>
          <form onSubmit={createDecision} className="space-y-3">
            <div>
              <label className="label">Décision à prendre *</label>
              <input name="title" className="input" required />
            </div>
            <div>
              <label className="label">Contexte</label>
              <textarea name="context" className="input" rows={3} placeholder="Enjeux, options envisagées…" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </Modal>
      )}

      {arbitrating && (
        <Modal title={`Arbitrer : ${arbitrating.title}`} onClose={() => setArbitrating(null)}>
          <form onSubmit={arbitrate} className="space-y-3">
            <div>
              <label className="label">Décision retenue *</label>
              <textarea name="outcome" className="input" rows={3} required />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setArbitrating(null)}>Annuler</button>
              <button type="submit" className="btn-primary">Arbitrer</button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Indicateurs

function IndicatorsTab({ objectiveId, indicators, refresh }: {
  objectiveId: string
  indicators: Indicator[]
  refresh: () => void
}) {
  const [showNew, setShowNew] = useState(false)

  async function createIndicator(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await insert('indicators', {
      objective_id: objectiveId,
      name: String(fd.get('name')),
      unit: String(fd.get('unit') ?? ''),
      target_value: Number(fd.get('target_value') ?? 0),
      current_value: Number(fd.get('current_value') ?? 0),
      due_date: String(fd.get('due_date')) || null,
      updated_at: new Date().toISOString(),
    } as Partial<Indicator>)
    setShowNew(false)
    refresh()
  }

  async function updateValue(ind: Indicator, value: number) {
    await update('indicators', ind.id, { current_value: value, updated_at: new Date().toISOString() })
    refresh()
  }

  return (
    <Card title="◈ Indicateurs de résultat" action={<button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter un indicateur</button>}>
      {indicators.length === 0 ? (
        <EmptyState>Définissez des indicateurs avec cible et échéance pour mesurer l'atteinte réelle de vos attendus.</EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {indicators.map((ind) => {
            const pct = ind.target_value ? Math.min(100, (ind.current_value / ind.target_value) * 100) : 0
            return (
              <div key={ind.id} className="rounded-lg border border-aura-100 p-4">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h3 className="text-sm font-bold">{ind.name}</h3>
                  <button
                    className="text-xs text-aura-700/60 hover:text-coral-600"
                    onClick={async () => { if (confirm('Supprimer cet indicateur ?')) { await remove('indicators', ind.id); refresh() } }}
                  >Supprimer</button>
                </div>
                <div className="text-2xl font-extrabold">
                  {ind.current_value}
                  <span className="text-sm text-aura-700 font-semibold"> / {ind.target_value} {ind.unit}</span>
                </div>
                <ProgressBar value={pct} className="mt-2" />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] text-aura-700/60">Échéance : {formatDate(ind.due_date)}</span>
                  <label className="text-xs flex items-center gap-1.5">
                    Relevé :
                    <input
                      type="number"
                      className="w-20 rounded-md border border-aura-200 px-2 py-1 text-xs"
                      defaultValue={ind.current_value}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (v !== ind.current_value) updateValue(ind, v)
                      }}
                    />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && (
        <Modal title="Ajouter un indicateur" onClose={() => setShowNew(false)}>
          <form onSubmit={createIndicator} className="space-y-3">
            <div>
              <label className="label">Nom *</label>
              <input name="name" className="input" required placeholder="Ex. : Participants inscrits" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cible *</label>
                <input type="number" name="target_value" className="input" required />
              </div>
              <div>
                <label className="label">Valeur actuelle</label>
                <input type="number" name="current_value" className="input" defaultValue={0} />
              </div>
              <div>
                <label className="label">Unité</label>
                <input name="unit" className="input" placeholder="pers., €, %…" />
              </div>
              <div>
                <label className="label">Échéance</label>
                <input type="date" name="due_date" className="input" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}
