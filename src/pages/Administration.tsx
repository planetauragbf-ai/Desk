import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_LOGO, useBranding } from '../context/BrandingContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import { MODULES } from '../lib/permissions'
import type { Objective, Profile } from '../lib/types'
import { Avatar, Card, EmptyState, Modal } from '../components/ui'

export default function Administration() {
  const { profile: me } = useAuth()
  const [managing, setManaging] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)

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
      <h1 className="text-2xl font-extrabold">Administration</h1>

      <BrandingCard />

      <Card
        title="Comptes salariés"
        action={<button className="btn-primary" onClick={() => setCreating(true)}>+ Créer un compte salarié</button>}
      >
        <p className="text-sm text-aura-700/80 mb-4">
          Vous créez ici les comptes de vos salariés : chacun reçoit un email avec un lien pour définir
          son mot de passe et se connecter. Gérez ensuite leurs accès : rôle, onglets (modules) visibles,
          et projets accessibles. Un salarié voit automatiquement les projets dont il est référent ou sur
          lesquels une tâche lui est attribuée ; l'accès à un projet ouvre aussi tous ses sous-objectifs.
          Les administrateurs voient tout.
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

      {creating && (
        <CreateEmployeeModal
          instances={instances}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refreshProfiles() }}
        />
      )}

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

function CreateEmployeeModal({ instances, onClose, onCreated }: {
  instances: { id: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const { createEmployee } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Profile['role']>('membre')
  const [instanceId, setInstanceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await createEmployee(fullName.trim(), email.trim().toLowerCase())
      if (result.error) {
        setError(result.error)
        return
      }
      // Applique rôle et instance sur le profil créé par le trigger
      // (petite tolérance au délai de propagation).
      if (result.userId) {
        for (let i = 0; i < 5; i++) {
          try {
            await update('profiles', result.userId, { role, instance_id: instanceId || null })
            break
          } catch {
            await new Promise((r) => setTimeout(r, 800))
          }
        }
      }
      setSuccess(true)
    } finally {
      setBusy(false)
    }
  }

  if (success) {
    return (
      <Modal title="Compte créé ✔" onClose={onCreated}>
        <p className="text-sm text-aura-700">
          Le compte de <strong>{fullName}</strong> est créé. Un email vient d'être envoyé à{' '}
          <strong>{email}</strong> avec un lien pour définir son mot de passe et se connecter.
        </p>
        <p className="text-xs text-aura-700/70 mt-2">
          Si l'email n'arrive pas : vérifiez les spams, ou renvoyez le lien depuis l'écran de
          connexion (« Mot de passe oublié ou premier accès ? »).
        </p>
        <div className="flex justify-end mt-4">
          <button className="btn-primary" onClick={onCreated}>Fermer</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Créer un compte salarié" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Nom complet *</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Ex. : Emma Martin" />
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="emma@planet-aura.com" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Rôle</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Profile['role'])}>
              <option value="membre">Membre</option>
              <option value="referent">Référent</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <div>
            <label className="label">Instance</label>
            <select className="input" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              <option value="">—</option>
              {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-aura-700/70">
          Le salarié recevra un email avec un lien pour choisir son mot de passe. Vous pourrez ensuite
          régler ses onglets et projets via « Gérer les accès ».
        </p>
        {error && <p className="text-sm text-coral-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer et envoyer l\'email'}</button>
        </div>
      </form>
    </Modal>
  )
}

function BrandingCard() {
  const { logoUrl, setLogo, resetLogo } = useBranding()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await setLogo(file)
      setMessage('Logo mis à jour. Il s’applique immédiatement pour tous les utilisateurs.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onReset() {
    if (!confirm('Revenir au logo par défaut ?')) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await resetLogo()
      setMessage('Logo par défaut restauré.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Personnalisation — Logo de l'application">
      <div className="flex flex-wrap items-center gap-5">
        <img src={logoUrl} alt="Logo actuel" className="h-20 w-20 rounded-full border border-aura-100 object-contain bg-white" />
        <div className="flex-1 min-w-60">
          <p className="text-sm text-aura-700/80 mb-3">
            Téléversez votre logo (PNG, JPG, SVG ou WebP — idéalement carré, 512×512 px). Il remplace le
            logo dans le menu, sur l'écran de connexion et dans l'onglet du navigateur, pour tout le monde.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`btn-primary cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {busy ? 'Envoi en cours…' : 'Choisir un fichier…'}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={onFile} disabled={busy} />
            </label>
            {logoUrl !== DEFAULT_LOGO && (
              <button className="btn-secondary" onClick={onReset} disabled={busy}>Revenir au logo par défaut</button>
            )}
          </div>
          {message && <p className="text-sm text-emerald-700 mt-2">{message}</p>}
          {error && <p className="text-sm text-coral-600 mt-2">{error}</p>}
        </div>
      </div>
    </Card>
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
