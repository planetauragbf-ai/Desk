import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { visibleObjectives } from '../lib/permissions'
import { formatDate } from '../lib/format'
import { insert, remove, update } from '../lib/data'
import type { DocumentMeta } from '../lib/types'
import { Card, EmptyState, Modal } from '../components/ui'

export default function DocumentsPage() {
  const { profile } = useAuth()
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<DocumentMeta | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { rows: documents, refresh } = useTable('documents', undefined, { column: 'created_at', ascending: false })
  const { rows: folderRows, refresh: refreshFolders } = useTable('folders', { kind: 'documents' }, { column: 'created_at', ascending: true })
  const { rows: allObjectives } = useTable('objectives')
  const { rows: tasks } = useTable('tasks')
  const { rows: membersRows } = useTable('objective_members')

  const objectives = useMemo(
    () => visibleObjectives(profile, allObjectives, membersRows, tasks),
    [profile, allObjectives, membersRows, tasks],
  )

  // Dossiers = table folders + dossiers encore présents sur des documents.
  const folders = useMemo(() => {
    const names = folderRows.map((f) => f.name)
    for (const d of documents) if (!names.includes(d.folder)) names.push(d.folder)
    if (!names.includes('Général')) names.unshift('Général')
    return names
  }, [folderRows, documents])

  const filtered = useMemo(() => {
    const visibleIds = new Set(objectives.map((o) => o.id))
    let d = documents.filter((x) => !x.objective_id || visibleIds.has(x.objective_id))
    if (folder) d = d.filter((x) => x.folder === folder)
    const q = search.trim().toLowerCase()
    if (q) d = d.filter((x) => x.name.toLowerCase().includes(q))
    return d
  }, [documents, objectives, folder, search])

  async function saveDoc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload = {
      name: String(fd.get('name')),
      folder: String(fd.get('folder') || 'Général'),
      url: String(fd.get('url')) || null,
      objective_id: String(fd.get('objective_id')) || null,
    }
    if (editing) {
      await update('documents', editing.id, payload)
      setEditing(null)
    } else {
      await insert('documents', { ...payload, author_id: profile?.id ?? null } as Partial<DocumentMeta>)
      setShowNew(false)
    }
    refresh()
  }

  async function createFolder() {
    const name = prompt('Nom du nouveau dossier :')?.trim()
    if (!name) return
    if (folders.includes(name)) return alert('Ce dossier existe déjà.')
    await insert('folders', { kind: 'documents', name })
    refreshFolders()
  }

  async function renameFolder(oldName: string) {
    const name = prompt(`Renommer le dossier « ${oldName} » en :`, oldName)?.trim()
    if (!name || name === oldName) return
    if (folders.includes(name)) return alert('Un dossier porte déjà ce nom.')
    const row = folderRows.find((f) => f.name === oldName)
    if (row) await update('folders', row.id, { name })
    else await insert('folders', { kind: 'documents', name })
    // Déplace les documents du dossier renommé.
    await Promise.all(documents.filter((d) => d.folder === oldName).map((d) => update('documents', d.id, { folder: name })))
    if (folder === oldName) setFolder(name)
    refreshFolders()
    refresh()
  }

  async function deleteFolder(name: string) {
    const count = documents.filter((d) => d.folder === name).length
    if (!confirm(count
      ? `Supprimer le dossier « ${name} » ? Ses ${count} document(s) seront déplacés dans « Général ».`
      : `Supprimer le dossier « ${name} » ?`)) return
    await Promise.all(documents.filter((d) => d.folder === name).map((d) => update('documents', d.id, { folder: 'Général' })))
    const row = folderRows.find((f) => f.name === name)
    if (row) await remove('folders', row.id)
    if (folder === name) setFolder(null)
    refreshFolders()
    refresh()
  }

  const objectiveTitle = (id: string | null) => objectives.find((o) => o.id === id)?.title

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Documents</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={createFolder}>+ Nouveau dossier</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter un document</button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-5">
          {folders.map((f) => {
            const count = documents.filter((d) => d.folder === f).length
            return (
              <div
                key={f}
                className={`group relative flex flex-col items-center gap-1 rounded-lg px-4 py-3 border transition-colors cursor-pointer ${
                  folder === f ? 'border-accent-500 bg-accent-500/10' : 'border-aura-100 hover:bg-aura-50'
                }`}
                onClick={() => setFolder(folder === f ? null : f)}
              >
                <span className="text-2xl">🗂</span>
                <span className="text-xs font-semibold">{f}</span>
                <span className="text-[10px] text-aura-700/60">{count} fichier(s)</span>
                {f !== 'Général' && (
                  <span className="absolute -top-2 -right-2 hidden group-hover:flex gap-1">
                    <button
                      className="h-5 w-5 rounded-full bg-white border border-aura-100 text-[10px] shadow-sm hover:bg-aura-50"
                      title="Renommer"
                      onClick={(e) => { e.stopPropagation(); renameFolder(f) }}
                    >✎</button>
                    <button
                      className="h-5 w-5 rounded-full bg-white border border-aura-100 text-[10px] shadow-sm text-coral-600 hover:bg-aura-50"
                      title="Supprimer"
                      onClick={(e) => { e.stopPropagation(); deleteFolder(f) }}
                    >🗑</button>
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <input className="input max-w-sm mb-4" placeholder="Rechercher un document…" value={search} onChange={(e) => setSearch(e.target.value)} />

        {filtered.length === 0 ? (
          <EmptyState>Aucun document{folder ? ` dans « ${folder} »` : ''}.</EmptyState>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head rounded-l-lg">Nom</th>
                <th className="table-head">Dossier</th>
                <th className="table-head">Objectif lié</th>
                <th className="table-head">Ajout</th>
                <th className="table-head rounded-r-lg w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-aura-50/60">
                  <td className="table-cell font-medium">
                    {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent-500 hover:underline">{d.name}</a> : d.name}
                  </td>
                  <td className="table-cell">{d.folder}</td>
                  <td className="table-cell">
                    {d.objective_id ? (
                      <Link to={`/objectifs/${d.objective_id}`} className="hover:underline text-aura-700">{objectiveTitle(d.objective_id)}</Link>
                    ) : '—'}
                  </td>
                  <td className="table-cell whitespace-nowrap">{formatDate(d.created_at)}</td>
                  <td className="table-cell whitespace-nowrap">
                    <button
                      className="text-aura-700/60 hover:text-aura-900 mr-2"
                      onClick={() => setEditing(d)}
                      aria-label="Modifier"
                    >✎</button>
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
      </Card>

      {(showNew || editing) && (
        <Modal title={editing ? 'Modifier le document' : 'Ajouter un document'} onClose={() => { setShowNew(false); setEditing(null) }}>
          <form onSubmit={saveDoc} className="space-y-3">
            <div>
              <label className="label">Nom *</label>
              <input name="name" className="input" required defaultValue={editing?.name ?? ''} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Dossier</label>
                <select name="folder" className="input" defaultValue={editing?.folder ?? folder ?? 'Général'}>
                  {folders.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Lien (URL)</label>
                <input name="url" className="input" placeholder="https://…" defaultValue={editing?.url ?? ''} />
              </div>
            </div>
            <div>
              <label className="label">Objectif lié</label>
              <select name="objective_id" className="input" defaultValue={editing?.objective_id ?? ''}>
                <option value="">Aucun</option>
                {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setShowNew(false); setEditing(null) }}>Annuler</button>
              <button type="submit" className="btn-primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
