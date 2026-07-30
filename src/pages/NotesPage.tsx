import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { can, visibleObjectives } from '../lib/permissions'
import { formatDate, profileName } from '../lib/format'
import { insert, remove, update } from '../lib/data'
import type { Note } from '../lib/types'
import { Card, EmptyState, Modal } from '../components/ui'

export default function NotesPage() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const showNew = params.get('nouvelle') === '1'
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Note | null>(null)

  const { rows: notes, refresh } = useTable('notes', undefined, { column: 'updated_at', ascending: false })
  const { rows: profiles } = useTable('profiles')
  const { rows: allObjectives } = useTable('objectives')
  const { rows: tasks } = useTable('tasks')
  const { rows: membersRows } = useTable('objective_members')

  const objectives = useMemo(
    () => visibleObjectives(profile, allObjectives, membersRows, tasks),
    [profile, allObjectives, membersRows, tasks],
  )

  const filtered = useMemo(() => {
    const visibleIds = new Set(objectives.map((o) => o.id))
    const accessible = notes.filter((n) => !n.objective_id || visibleIds.has(n.objective_id))
    const q = search.trim().toLowerCase()
    if (!q) return accessible
    return accessible.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
  }, [notes, objectives, search])

  async function saveNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const now = new Date().toISOString()
    const payload = {
      title: String(fd.get('title')),
      content: String(fd.get('content') ?? ''),
      objective_id: String(fd.get('objective_id')) || null,
      updated_at: now,
    }
    if (editing) {
      await update('notes', editing.id, payload)
      setEditing(null)
    } else {
      await insert('notes', { ...payload, author_id: profile?.id ?? null, shared: true, created_at: now } as Partial<Note>)
      setParams({})
    }
    refresh()
  }

  const objectiveTitle = (id: string | null) => objectives.find((o) => o.id === id)?.title

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Notes</h1>
        {can(profile, 'notes_ajout') && (
          <button className="btn-primary" onClick={() => setParams({ nouvelle: '1' })}>+ Ajouter une note</button>
        )}
      </div>

      <Card>
        <input className="input max-w-sm mb-4" placeholder="Rechercher une note…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {filtered.length === 0 ? (
          <EmptyState>Aucune note. Centralisez ici vos comptes-rendus et idées, reliés aux objectifs.</EmptyState>
        ) : (
          <div className="space-y-3">
            {filtered.map((n) => (
              <article key={n.id} className="rounded-lg border border-aura-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold">{n.title}</h3>
                  {can(profile, 'notes_ajout') && (
                    <div className="flex gap-3 text-xs">
                      <button className="text-aura-700 underline" onClick={() => setEditing(n)}>Modifier</button>
                      <button
                        className="text-coral-600 underline"
                        onClick={async () => { if (confirm('Supprimer cette note ?')) { await remove('notes', n.id); refresh() } }}
                      >Supprimer</button>
                    </div>
                  )}
                </div>
                <p className="text-sm text-aura-800 whitespace-pre-wrap mt-1">{n.content}</p>
                <p className="text-[11px] text-aura-700/60 mt-2">
                  {profileName(profiles, n.author_id)} — {formatDate(n.updated_at)}
                  {n.objective_id && (
                    <> · Objectif : <Link to={`/objectifs/${n.objective_id}`} className="underline">{objectiveTitle(n.objective_id)}</Link></>
                  )}
                </p>
              </article>
            ))}
          </div>
        )}
      </Card>

      {(showNew || editing) && (
        <Modal title={editing ? 'Modifier la note' : 'Ajouter une note'} onClose={() => { setParams({}); setEditing(null) }}>
          <form onSubmit={saveNote} className="space-y-3">
            <div>
              <label className="label">Titre *</label>
              <input name="title" className="input" required defaultValue={editing?.title ?? ''} />
            </div>
            <div>
              <label className="label">Contenu</label>
              <textarea name="content" className="input" rows={6} defaultValue={editing?.content ?? ''} />
            </div>
            <div>
              <label className="label">Objectif lié</label>
              <select name="objective_id" className="input" defaultValue={editing?.objective_id ?? ''}>
                <option value="">Aucun</option>
                {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setParams({}); setEditing(null) }}>Annuler</button>
              <button type="submit" className="btn-primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
