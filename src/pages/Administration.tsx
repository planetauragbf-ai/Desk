import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import { MODULES } from '../lib/permissions'
import type { Objective, Profile } from '../lib/types'
import { Avatar, Card, EmptyState, Modal } from '../components/ui'

export default function Administration() {
  const { profile: me } = useAuth()
  const [managing, setManaging] = useState<Profile | null>(null)

  const { rows: profiles, refresh: refreshProfiles } = useTable('profiles', undefined, { column: 'full_name', ascending: true })
  const { rows: instances } = useTable('instances', undefined, { column: 'level', ascending: true })
  const { rows: objectives } = useTable('objectives', undefined, { column: 'created_at', ascending: true })
  const { rows: members, refresh: refreshMembers } = useTable('objective_members')

  if (me?.role !== 'admin') {
    return <p className="text-aura-700">Cette page est réservée aux administrateurs.</p>
  }

  const instanceName = (id: string | null) => instances.find((i) => i.id === id)?.name ?? '—'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Administration des comptes</h1>

      <Card>
        <p className="text-sm text-aura-700/80 mb-4">
          Gérez ici les accès de chaque salarié : son rôle, les onglets (modules) qu'il voit dans le menu,
          et les projets auxquels il a accès. Un salarié voit automatiquement les projets dont il est
          référent ou sur lesquels une tâche lui est attribuée ; l'accès à un projet ouvre aussi tous ses
          sous-objectifs. Les administrateurs voient tout.
        </p>
        {profiles.length === 0 ? (
          <EmptyState>Aucun compte. Les comptes apparaissent ici dès qu'un salarié s'inscrit.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg">Salarié</th>
                  <th className="table-head">Rôle</th>
                  <th className="table-head">Instance</th>
                  <th className="table-head">Onglets visibles</th>
                  <th className="table-head">Projets accordés</th>
                  <th className="table-head rounded-r-lg w-32"></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => {
                  const grants = members.filter((m) => m.profile_id === p.id)
                  return (
                    <tr key={p.id} className="hover:bg-aura-50/60">
                      <td className="table-cell">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={p.full_name} />
                          <div>
                            <div className="font-semibold">{p.full_name}{p.id === me.id && <span className="text-xs text-aura-700/60"> (vous)</span>}</div>
                            <div className="text-xs text-aura-700/60">{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${p.role === 'admin' ? 'bg-aura-900 text-white' : 'bg-aura-100 text-aura-800'}`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="table-cell whitespace-nowrap">{instanceName(p.instance_id)}</td>
                      <td className="table-cell text-xs">
                        {p.role === 'admin' || !p.modules ? 'Tous' : p.modules.length === 0 ? 'Tableau de bord seul' : `${p.modules.length} module(s)`}
                      </td>
                      <td className="table-cell text-xs">
                        {p.role === 'admin' ? 'Tous' : grants.length === 0 ? 'Ses projets uniquement' : `${grants.length} projet(s)`}
                      </td>
                      <td className="table-cell">
                        <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setManaging(p)}>Gérer les accès</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {managing && (
        <ManageAccessModal
          key={managing.id}
          user={managing}
          isSelf={managing.id === me.id}
          instances={instances}
          objectives={objectives}
          grantedIds={members.filter((m) => m.profile_id === managing.id).map((m) => m.objective_id)}
          onClose={() => setManaging(null)}
          onSaved={() => { setManaging(null); refreshProfiles(); refreshMembers() }}
          memberRows={members}
        />
      )}
    </div>
  )
}

function ManageAccessModal({ user, isSelf, instances, objectives, grantedIds, memberRows, onClose, onSaved }: {
  user: Profile
  isSelf: boolean
  instances: { id: string; name: string }[]
  objectives: Objective[]
  grantedIds: string[]
  memberRows: { id: string; objective_id: string; profile_id: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState(user.role)
  const [instanceId, setInstanceId] = useState(user.instance_id ?? '')
  const [allModules, setAllModules] = useState(user.modules === null)
  const [moduleKeys, setModuleKeys] = useState<string[]>(user.modules ?? MODULES.map((m) => m.key))
  const [projects, setProjects] = useState<string[]>(grantedIds)
  const [busy, setBusy] = useState(false)

  // Arbre d'objectifs indenté pour l'affichage.
  const ordered = useMemo(() => {
    const out: { obj: Objective; depth: number }[] = []
    const walk = (parentId: string | null, depth: number) => {
      for (const o of objectives.filter((x) => x.parent_id === parentId)) {
        out.push({ obj: o, depth })
        walk(o.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [objectives])

  function toggleModule(key: string) {
    setModuleKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]))
  }

  function toggleProject(id: string) {
    setProjects((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function save() {
    setBusy(true)
    try {
      await update('profiles', user.id, {
        role,
        instance_id: instanceId || null,
        modules: role === 'admin' || allModules ? null : moduleKeys,
      })
      // Synchroniser les projets accordés.
      const existing = memberRows.filter((m) => m.profile_id === user.id)
      for (const m of existing) {
        if (!projects.includes(m.objective_id)) await remove('objective_members', m.id)
      }
      for (const objectiveId of projects) {
        if (!existing.some((m) => m.objective_id === objectiveId)) {
          await insert('objective_members', { objective_id: objectiveId, profile_id: user.id })
        }
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Accès de ${user.full_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Rôle</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Profile['role'])} disabled={isSelf}>
              <option value="membre">Membre</option>
              <option value="referent">Référent</option>
              <option value="admin">Administrateur</option>
            </select>
            {isSelf && <p className="text-[11px] text-aura-700/60 mt-1">Vous ne pouvez pas modifier votre propre rôle.</p>}
          </div>
          <div>
            <label className="label">Instance</label>
            <select className="input" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              <option value="">—</option>
              {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        </div>

        {role !== 'admin' && (
          <>
            <div>
              <label className="label">Onglets (modules) visibles</label>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input type="checkbox" checked={allModules} onChange={(e) => setAllModules(e.target.checked)} />
                Tous les modules
              </label>
              {!allModules && (
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-aura-100 p-3">
                  {MODULES.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={moduleKeys.includes(m.key)} onChange={() => toggleModule(m.key)} />
                      {m.label}
                    </label>
                  ))}
                  <p className="col-span-2 text-[11px] text-aura-700/60">Le tableau de bord est toujours accessible.</p>
                </div>
              )}
            </div>

            <div>
              <label className="label">Projets accordés</label>
              <p className="text-[11px] text-aura-700/60 mb-2">
                Cocher un projet donne aussi accès à tous ses sous-objectifs. S'ajoutent automatiquement :
                les projets dont ce salarié est référent et ceux où une tâche lui est attribuée.
              </p>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-aura-100 p-3 space-y-1.5">
                {ordered.length === 0 && <p className="text-xs text-aura-700/60">Aucun objectif créé.</p>}
                {ordered.map(({ obj, depth }) => (
                  <label key={obj.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: depth * 18 }}>
                    <input type="checkbox" checked={projects.includes(obj.id)} onChange={() => toggleProject(obj.id)} />
                    <span className="truncate">{obj.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {role === 'admin' && (
          <p className="text-sm text-aura-700/80 rounded-lg bg-aura-50 p-3">
            Un administrateur a accès à tous les modules et à tous les projets, et gère les comptes.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  )
}
