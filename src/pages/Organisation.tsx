import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import type { Instance, Profile } from '../lib/types'
import { Avatar, Card, EmptyState, Modal } from '../components/ui'

export default function Organisation() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const { rows: instances, refresh: refreshInstances } = useTable('instances', undefined, { column: 'level', ascending: true })
  const { rows: profiles, refresh: refreshProfiles } = useTable('profiles', undefined, { column: 'full_name', ascending: true })

  const current = instances.find((i) => i.id === selected)
  const members = profiles.filter((p) => p.instance_id === selected)

  async function createInstance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const parentId = String(fd.get('parent_id')) || null
    const parent = instances.find((i) => i.id === parentId)
    await insert('instances', {
      name: String(fd.get('name')),
      parent_id: parentId,
      level: parent ? parent.level + 1 : 1,
    } as Partial<Instance>)
    setShowNew(false)
    refreshInstances()
  }

  async function assignMember(memberId: string, instanceId: string | null) {
    await update('profiles', memberId, { instance_id: instanceId })
    refreshProfiles()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Organigramme</h1>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter une instance</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Instances actives">
          {instances.length === 0 ? (
            <EmptyState>Créez vos instances (direction, pôles, équipes) pour structurer l'organisation.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg">Intitulé</th>
                  <th className="table-head">Niveau</th>
                  <th className="table-head">Utilisateurs</th>
                  <th className="table-head rounded-r-lg w-10"></th>
                </tr>
              </thead>
              <tbody>
                {instances.map((i) => (
                  <tr
                    key={i.id}
                    className={`cursor-pointer hover:bg-aura-50/60 ${selected === i.id ? 'bg-aura-50' : ''}`}
                    onClick={() => setSelected(i.id)}
                  >
                    <td className="table-cell font-medium">
                      {i.level > 1 && <span className="text-aura-700/40 mr-1">{'└'.padStart(i.level - 1, ' ')}</span>}
                      {i.name}
                    </td>
                    <td className="table-cell">{i.level}</td>
                    <td className="table-cell">{profiles.filter((p) => p.instance_id === i.id).length}</td>
                    <td className="table-cell">
                      {isAdmin && (
                        <button
                          className="text-aura-700/60 hover:text-coral-600"
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Supprimer l'instance « ${i.name} » ?`)) return
                            await remove('instances', i.id)
                            if (selected === i.id) setSelected(null)
                            refreshInstances()
                          }}
                          aria-label="Supprimer"
                        >🗑</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={current ? `Utilisateurs liés — ${current.name}` : 'Utilisateurs'}>
          {!current ? (
            <div>
              <p className="text-sm text-aura-700/70 mb-3">Tous les membres de l'espace :</p>
              <ul className="space-y-2">
                {profiles.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 text-sm border-b border-aura-100 pb-2 last:border-0">
                    <Avatar name={p.full_name} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{p.full_name}</div>
                      <div className="text-xs text-aura-700/60 truncate">{p.email}</div>
                    </div>
                    <span className="text-[11px] rounded-full bg-aura-100 px-2 py-0.5 font-semibold text-aura-700 capitalize">{p.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : members.length === 0 ? (
            <EmptyState>Aucun membre rattaché à cette instance.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {members.map((p) => (
                <li key={p.id} className="flex items-center gap-3 text-sm border-b border-aura-100 pb-2 last:border-0">
                  <Avatar name={p.full_name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.full_name}</div>
                    <div className="text-xs text-aura-700/60 truncate">{p.email}</div>
                  </div>
                  {isAdmin && (
                    <button className="text-xs text-aura-700 underline" onClick={() => assignMember(p.id, null)}>Détacher</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {current && isAdmin && (
            <div className="mt-4 border-t border-aura-100 pt-3">
              <label className="label">Lier un utilisateur à cette instance</label>
              <select
                className="input"
                value=""
                onChange={(e) => e.target.value && assignMember(e.target.value, current.id)}
              >
                <option value="">Choisir un membre…</option>
                {profiles.filter((p) => p.instance_id !== current.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </Card>
      </div>

      {showNew && (
        <Modal title="Ajouter une instance" onClose={() => setShowNew(false)}>
          <form onSubmit={createInstance} className="space-y-3">
            <div>
              <label className="label">Intitulé *</label>
              <input name="name" className="input" required placeholder="Ex. : Pôle Communication" />
            </div>
            <div>
              <label className="label">Instance parente</label>
              <select name="parent_id" className="input" defaultValue="">
                <option value="">Aucune (niveau 1)</option>
                {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
