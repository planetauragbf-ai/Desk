import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import type { LinkItem } from '../lib/types'
import { Card, EmptyState, Modal } from '../components/ui'

const SUGGESTED_EMOJIS = ['🔗', '📧', '🗓️', '📁', '🎨', '📊', '💬', '🌍', '🛠️', '📝', '💶', '🎥']

export default function LinksPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<LinkItem | null>(null)

  const { rows: links, refresh } = useTable('links', undefined, { column: 'created_at', ascending: true })
  const { rows: folderRows, refresh: refreshFolders } = useTable('folders', { kind: 'liens' }, { column: 'created_at', ascending: true })

  // Catégories = table folders + catégories encore présentes sur des liens.
  const allCategories = useMemo(() => {
    const names = folderRows.map((f) => f.name)
    for (const l of links) if (!names.includes(l.category)) names.push(l.category)
    if (!names.includes('Général')) names.unshift('Général')
    return names
  }, [folderRows, links])

  const categories = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? links.filter((l) =>
          [l.label, l.description, l.category, l.url].some((s) => s.toLowerCase().includes(q)),
        )
      : links
    const map = new Map<string, LinkItem[]>()
    // Les catégories vides restent visibles (hors recherche) pour pouvoir les gérer.
    if (!q) for (const name of allCategories) map.set(name, [])
    for (const l of filtered) {
      const arr = map.get(l.category) ?? []
      arr.push(l)
      map.set(l.category, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [links, search, allCategories])

  async function createCategory() {
    const name = prompt('Nom de la nouvelle catégorie :')?.trim()
    if (!name) return
    if (allCategories.includes(name)) return alert('Cette catégorie existe déjà.')
    await insert('folders', { kind: 'liens', name })
    refreshFolders()
  }

  async function renameCategory(oldName: string) {
    const name = prompt(`Renommer la catégorie « ${oldName} » en :`, oldName)?.trim()
    if (!name || name === oldName) return
    if (allCategories.includes(name)) return alert('Une catégorie porte déjà ce nom.')
    const row = folderRows.find((f) => f.name === oldName)
    if (row) await update('folders', row.id, { name })
    else await insert('folders', { kind: 'liens', name })
    await Promise.all(links.filter((l) => l.category === oldName).map((l) => update('links', l.id, { category: name })))
    refreshFolders()
    refresh()
  }

  async function deleteCategory(name: string) {
    const count = links.filter((l) => l.category === name).length
    if (!confirm(count
      ? `Supprimer la catégorie « ${name} » ? Ses ${count} lien(s) seront déplacés dans « Général ».`
      : `Supprimer la catégorie « ${name} » ?`)) return
    await Promise.all(links.filter((l) => l.category === name).map((l) => update('links', l.id, { category: 'Général' })))
    const row = folderRows.find((f) => f.name === name)
    if (row) await remove('folders', row.id)
    refreshFolders()
    refresh()
  }

  async function saveLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    let url = String(fd.get('url')).trim()
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    const payload = {
      label: String(fd.get('label')),
      url,
      description: String(fd.get('description') ?? ''),
      category: String(fd.get('category')).trim() || 'Général',
      emoji: String(fd.get('emoji')).trim() || '🔗',
    }
    if (editing) {
      await update('links', editing.id, payload)
      setEditing(null)
    } else {
      await insert('links', { ...payload, author_id: profile?.id ?? null })
      setShowNew(false)
    }
    refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Liens & outils</h1>
          <p className="text-sm text-aura-700/80 mt-1">
            Tous les outils, applications et raccourcis de l'équipe Planet Aura, à portée de clic.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={createCategory}>+ Nouvelle catégorie</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter un lien</button>
        </div>
      </div>

      <Card>
        <input
          className="input max-w-sm mb-4"
          placeholder="Rechercher un outil…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {categories.length === 0 ? (
          <EmptyState>
            Aucun lien pour le moment. Ajoutez ici vos outils du quotidien : messagerie, drive, réseaux sociaux, banque, design…
          </EmptyState>
        ) : (
          <div className="space-y-6">
            {categories.map(([category, items]) => (
              <section key={category}>
                <div className="group/cat flex items-center gap-2 mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-aura-700/70">{category}</h2>
                  {category !== 'Général' && (
                    <span className="hidden group-hover/cat:flex gap-2 text-[11px]">
                      <button className="text-aura-700 underline" onClick={() => renameCategory(category)}>Renommer</button>
                      <button className="text-coral-600 underline" onClick={() => deleteCategory(category)}>Supprimer</button>
                    </span>
                  )}
                </div>
                {items.length === 0 && <p className="text-xs text-aura-700/50 mb-1">Catégorie vide.</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((l) => (
                    <div key={l.id} className="group relative rounded-lg border border-aura-100 hover:border-accent-400 hover:shadow-card transition-all">
                      <a href={l.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 p-4">
                        <span className="text-2xl leading-none">{l.emoji}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-aura-900 truncate">{l.label}</span>
                          <span className="block text-xs text-aura-700/70 mt-0.5 line-clamp-2">
                            {l.description || l.url.replace(/^https?:\/\//, '')}
                          </span>
                        </span>
                      </a>
                      <div className="absolute top-2 right-2 hidden group-hover:flex gap-2 text-[11px] bg-white/95 rounded px-1.5 py-0.5">
                        <button className="text-aura-700 underline" onClick={() => setEditing(l)}>Modifier</button>
                        <button
                          className="text-coral-600 underline"
                          onClick={async () => {
                            if (confirm(`Supprimer le lien « ${l.label} » ?`)) { await remove('links', l.id); refresh() }
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      {(showNew || editing) && (
        <Modal title={editing ? 'Modifier le lien' : 'Ajouter un lien'} onClose={() => { setShowNew(false); setEditing(null) }}>
          <form onSubmit={saveLink} className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <label className="label">Emoji</label>
                <input name="emoji" className="input text-center" defaultValue={editing?.emoji ?? '🔗'} list="emoji-suggestions" />
                <datalist id="emoji-suggestions">
                  {SUGGESTED_EMOJIS.map((e) => <option key={e} value={e} />)}
                </datalist>
              </div>
              <div>
                <label className="label">Nom de l'outil *</label>
                <input name="label" className="input" required defaultValue={editing?.label ?? ''} placeholder="ex. Gmail, Canva, Drive…" />
              </div>
            </div>
            <div>
              <label className="label">URL *</label>
              <input name="url" className="input" required defaultValue={editing?.url ?? ''} placeholder="https://…" />
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select name="category" className="input" defaultValue={editing?.category ?? 'Général'}>
                {allCategories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Description</label>
              <input name="description" className="input" defaultValue={editing?.description ?? ''} placeholder="À quoi sert cet outil ?" />
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
