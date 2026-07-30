import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { formatDate } from '../lib/format'
import { insert, remove } from '../lib/data'
import type { DocumentMeta } from '../lib/types'
import { Card, EmptyState, Modal } from '../components/ui'

const FOLDERS = ['Général', 'Projets', 'CR réunions', 'Contrats', 'Directives', 'Personnel']

export default function DocumentsPage() {
  const { profile } = useAuth()
  const [showNew, setShowNew] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { rows: documents, refresh } = useTable('documents', undefined, { column: 'created_at', ascending: false })
  const { rows: objectives } = useTable('objectives')

  const filtered = useMemo(() => {
    let d = documents
    if (folder) d = d.filter((x) => x.folder === folder)
    const q = search.trim().toLowerCase()
    if (q) d = d.filter((x) => x.name.toLowerCase().includes(q))
    return d
  }, [documents, folder, search])

  async function createDoc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await insert('documents', {
      name: String(fd.get('name')),
      folder: String(fd.get('folder') || 'Général'),
      url: String(fd.get('url')) || null,
      objective_id: String(fd.get('objective_id')) || null,
      author_id: profile?.id ?? null,
    } as Partial<DocumentMeta>)
    setShowNew(false)
    refresh()
  }

  const objectiveTitle = (id: string | null) => objectives.find((o) => o.id === id)?.title

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Documents</h1>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter un document</button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-5">
          {FOLDERS.map((f) => {
            const count = documents.filter((d) => d.folder === f).length
            return (
              <button
                key={f}
                onClick={() => setFolder(folder === f ? null : f)}
                className={`flex flex-col items-center gap-1 rounded-lg px-4 py-3 border transition-colors ${
                  folder === f ? 'border-accent-500 bg-aura-50' : 'border-aura-100 hover:bg-aura-50'
                }`}
              >
                <span className="text-2xl">🗂</span>
                <span className="text-xs font-semibold">{f}</span>
                <span className="text-[10px] text-aura-700/60">{count} fichier(s)</span>
              </button>
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
                <th className="table-head rounded-r-lg w-10"></th>
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
      </Card>

      {showNew && (
        <Modal title="Ajouter un document" onClose={() => setShowNew(false)}>
          <form onSubmit={createDoc} className="space-y-3">
            <div>
              <label className="label">Nom *</label>
              <input name="name" className="input" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Dossier</label>
                <select name="folder" className="input" defaultValue="Général">
                  {FOLDERS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Lien (URL)</label>
                <input name="url" className="input" placeholder="https://…" />
              </div>
            </div>
            <div>
              <label className="label">Objectif lié</label>
              <select name="objective_id" className="input" defaultValue="">
                <option value="">Aucun</option>
                {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Ajouter</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
