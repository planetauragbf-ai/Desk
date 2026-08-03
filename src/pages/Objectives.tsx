import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { signalerErreur } from '../lib/erreurs'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { computeStats } from '../lib/compute'
import { canCreateObjectives, visibleObjectives } from '../lib/permissions'
import { notify } from '../lib/notify'
import { formatDate, profileName } from '../lib/format'
import { insert } from '../lib/data'
import type { Objective, Priority } from '../lib/types'
import { Badge, Card, EmptyState, Modal, ProgressBar } from '../components/ui'

export default function Objectives() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const showNew = params.get('nouveau') === '1'
  const { rows: objectives, refresh } = useTable('objectives', undefined, { column: 'due_date', ascending: true })
  const { rows: tasks } = useTable('tasks')
  const { rows: indicators } = useTable('indicators')
  const { rows: profiles } = useTable('profiles')
  const { rows: instances } = useTable('instances')
  const { rows: members } = useTable('objective_members')

  const visibles = useMemo(
    () => visibleObjectives(profile, objectives, members, tasks),
    [profile, objectives, members, tasks],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visibles
    return visibles.filter((o) => o.title.toLowerCase().includes(q))
  }, [visibles, search])

  const statsById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeStats>>()
    for (const o of objectives) m.set(o.id, computeStats(o, objectives, tasks, indicators))
    return m
  }, [objectives, tasks, indicators])

  async function createObjective(e: FormEvent<HTMLFormElement>) {
    try {
      e.preventDefault()
      if (!canCreateObjectives(profile)) return
      const fd = new FormData(e.currentTarget)
      const created = await insert('objectives', {
        title: String(fd.get('title')),
        expected_result: String(fd.get('expected_result') ?? ''),
        parent_id: String(fd.get('parent_id')) || null,
        instance_id: String(fd.get('instance_id')) || null,
        priority: String(fd.get('priority')) as Priority,
        status: 'non_initie',
        start_date: String(fd.get('start_date')) || null,
        due_date: String(fd.get('due_date')) || null,
        owner_id: String(fd.get('owner_id')) || null,
        created_by: profile?.id ?? null,
      } as Partial<Objective>)
      const ownerId = String(fd.get('owner_id')) || null
      if (ownerId && ownerId !== profile?.id) {
        await notify(ownerId, `Vous êtes référent du nouvel objectif : « ${created.title} »`, `/objectifs/${created.id}`)
      }
      setParams({})
      refresh()
    } catch (err) {
      signalerErreur(err, "Création de l'objectif")
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Objectifs</h1>
        {canCreateObjectives(profile) && (
          <button className="btn-primary" onClick={() => setParams({ nouveau: '1' })}>+ Ajouter un objectif</button>
        )}
      </div>

      <Card>
        <input
          className="input max-w-sm mb-4"
          placeholder="Rechercher un objectif…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filtered.length === 0 ? (
          <EmptyState>Aucun objectif. Fixez votre premier objectif pour commencer.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg">Libellé</th>
                  <th className="table-head">Échéance</th>
                  <th className="table-head">Référent</th>
                  <th className="table-head w-44">Complétion</th>
                  <th className="table-head">Statut</th>
                  <th className="table-head rounded-r-lg">Priorité</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const s = statsById.get(o.id)
                  return (
                    <tr key={o.id} className="hover:bg-aura-50/60">
                      <td className="table-cell font-medium">
                        <Link to={`/objectifs/${o.id}`} className="hover:underline">
                          {o.parent_id && <span className="text-aura-700/50 mr-1">↳</span>}
                          {o.title}
                        </Link>
                      </td>
                      <td className="table-cell whitespace-nowrap">{formatDate(o.due_date)}</td>
                      <td className="table-cell whitespace-nowrap">{profileName(profiles, o.owner_id)}</td>
                      <td className="table-cell"><ProgressBar value={s?.completion ?? 0} /></td>
                      <td className="table-cell"><Badge value={o.status} kind="objective" /></td>
                      <td className="table-cell"><Badge value={o.priority} kind="priority" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showNew && canCreateObjectives(profile) && (
        <Modal title="Fixer un objectif" onClose={() => setParams({})}>
          <form onSubmit={createObjective} className="space-y-3">
            <div>
              <label className="label">Libellé *</label>
              <input name="title" className="input" required placeholder="Ex. : Lancer le nouveau site web" />
            </div>
            <div>
              <label className="label">Attendu / livrable</label>
              <textarea name="expected_result" className="input" rows={3} placeholder="Quel résultat concret attend-on ?" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Objectif parent</label>
                <select name="parent_id" className="input" defaultValue="">
                  <option value="">Aucun (objectif de tête)</option>
                  {visibles.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Instance</label>
                <select name="instance_id" className="input" defaultValue="">
                  <option value="">—</option>
                  {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Démarrage</label>
                <input type="date" name="start_date" className="input" />
              </div>
              <div>
                <label className="label">Échéance</label>
                <input type="date" name="due_date" className="input" />
              </div>
              <div>
                <label className="label">Priorité</label>
                <select name="priority" className="input" defaultValue="moyenne">
                  <option value="basse">Basse</option>
                  <option value="moyenne">Moyenne</option>
                  <option value="haute">Haute</option>
                  <option value="critique">Critique</option>
                </select>
              </div>
              <div>
                <label className="label">Référent</label>
                <select name="owner_id" className="input" defaultValue={profile?.id ?? ''}>
                  <option value="">—</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setParams({})}>Annuler</button>
              <button type="submit" className="btn-primary">Créer l'objectif</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
