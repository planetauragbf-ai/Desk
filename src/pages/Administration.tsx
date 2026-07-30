import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { APP_INFO, useBranding, type AppKey } from '../context/BrandingContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import { MODULES, PERM_DETAILS } from '../lib/permissions'
import type { DetailedPerms, Objective, Profile, StockAccess } from '../lib/types'
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
          Vous créez ici les comptes de vos salariés : un <strong>mot de passe provisoire est généré
          et affiché</strong>, vous le transmettez vous-même, et le salarié doit le changer à sa
          première connexion. Gérez ensuite leurs accès : rôle, modules visibles, autorisations
          détaillées, projets et droits Planet'Stock. Les administrateurs voient tout.
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
                            <div className="font-semibold">
                              {p.full_name}
                              {p.id === me.id && <span className="text-xs text-aura-700/60"> (vous)</span>}
                              {p.disabled && (
                                <span className="ml-2 rounded-full bg-coral-500/15 text-coral-600 px-2 py-0.5 text-[10px] font-bold uppercase">Désactivé</span>
                              )}
                            </div>
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
  const { createEmployee, sendPasswordReset } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Profile['role']>('membre')
  const [instanceId, setInstanceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [existing, setExisting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await createEmployee(fullName.trim(), email.trim().toLowerCase())
      if (result.code === 'exists') {
        setExisting(true)
        return
      }
      if (result.error) {
        setError(result.error)
        return
      }
      // Applique rôle, instance et changement de mot de passe obligatoire
      // sur le profil créé par le trigger (tolérance au délai).
      if (result.userId) {
        for (let i = 0; i < 5; i++) {
          try {
            await update('profiles', result.userId, { role, instance_id: instanceId || null, must_change_password: true })
            break
          } catch {
            await new Promise((r) => setTimeout(r, 800))
          }
        }
      }
      setTempPassword(result.tempPassword ?? null)
    } finally {
      setBusy(false)
    }
  }

  if (existing) {
    return (
      <Modal title="Un compte existe déjà pour cet email" onClose={onClose}>
        <p className="text-sm text-aura-700">
          <strong>{email}</strong> a déjà un compte de connexion (probablement un ancien compte
          supprimé : la suppression dans l'application retire le profil et les accès, mais le
          compte de connexion Supabase subsiste avec son ancien mot de passe).
        </p>
        <p className="text-sm text-aura-700 mt-2">Deux possibilités :</p>
        <ul className="text-sm text-aura-700 list-disc pl-5 mt-1 space-y-1">
          <li>
            La personne se connecte avec son <strong>ancien mot de passe</strong> : son profil sera
            recréé automatiquement, vous réglerez ensuite ses accès ici.
          </li>
          <li>
            Ou envoyez-lui un <strong>lien de réinitialisation</strong> pour qu'elle choisisse un
            nouveau mot de passe :
          </li>
        </ul>
        {resetSent ? (
          <p className="text-sm text-emerald-700 mt-3">✔ Email de réinitialisation envoyé à {email}.</p>
        ) : (
          <button
            className="btn-primary mt-3"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const err = await sendPasswordReset(email)
              setBusy(false)
              if (err) setError(err)
              else setResetSent(true)
            }}
          >
            Envoyer le lien de réinitialisation
          </button>
        )}
        {error && <p className="text-sm text-coral-600 mt-2">{error}</p>}
        <p className="text-xs text-aura-700/70 mt-3">
          Pour supprimer définitivement un compte de connexion : Supabase → Authentication → Users →
          supprimer l'utilisateur. Vous pourrez alors le recréer ici avec un mot de passe provisoire.
        </p>
        <div className="flex justify-end mt-4">
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </Modal>
    )
  }

  if (tempPassword) {
    return (
      <Modal title="Compte créé ✔" onClose={onCreated}>
        <p className="text-sm text-aura-700">
          Le compte de <strong>{fullName}</strong> est prêt. Transmettez-lui ces identifiants —
          <strong> aucun email ne lui a été envoyé</strong>, c'est vous qui avez la main :
        </p>
        <div className="rounded-lg border border-aura-100 bg-aura-50/60 p-4 my-3 space-y-1 font-mono text-sm">
          <div><span className="text-aura-700/60">Email : </span>{email}</div>
          <div><span className="text-aura-700/60">Mot de passe provisoire : </span><strong>{tempPassword}</strong></div>
        </div>
        <button
          className="btn-secondary !py-1.5 text-xs"
          onClick={() => navigator.clipboard?.writeText(`Planet'Desk — https://planet-desk.pages.dev\nEmail : ${email}\nMot de passe provisoire : ${tempPassword}`)}
        >
          📋 Copier les identifiants
        </button>
        <p className="text-xs text-aura-700/70 mt-3">
          À sa première connexion, {fullName.split(' ')[0]} devra obligatoirement choisir un mot de
          passe personnel. Ce mot de passe provisoire ne sera plus affiché : notez-le maintenant.
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
          Un <strong>mot de passe provisoire</strong> sera généré et affiché : vous le transmettez
          vous-même (aucun email automatique). Le salarié devra le changer à sa première connexion.
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
  const { logos, setLogo, resetLogo } = useBranding()
  const [busy, setBusy] = useState<AppKey | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(app: AppKey, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(app)
    setMessage(null)
    setError(null)
    try {
      await setLogo(app, file)
      setMessage(`Logo ${APP_INFO[app].name} mis à jour. Il s’applique immédiatement pour tous les utilisateurs.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function onReset(app: AppKey) {
    if (!confirm(`Revenir au logo par défaut de ${APP_INFO[app].name} ?`)) return
    setBusy(app)
    setMessage(null)
    setError(null)
    try {
      await resetLogo(app)
      setMessage(`Logo par défaut de ${APP_INFO[app].name} restauré.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const descriptions: Record<AppKey, string> = {
    desk: 'Portail : menu, écran de connexion et onglet du navigateur.',
    projects: 'Application de pilotage des projets.',
    dash: 'Dashboard de suivi logistique (à venir).',
    stock: 'Application de stockage & picking.',
    claim: 'Gestion des sinistres (à venir).',
  }

  return (
    <Card title="Personnalisation — Logos des applications">
      <p className="text-sm text-aura-700/80 mb-4">
        Chaque application a son logo (PNG, JPG, SVG ou WebP — idéalement carré, 512×512 px).
        Planet'Stock possède aussi son propre réglage de logo interne (fiches QR et relevés imprimés)
        dans son onglet Réglages.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {(Object.keys(APP_INFO) as AppKey[]).map((app) => (
          <div key={app} className="rounded-lg border border-aura-100 p-4 text-center">
            <img src={logos[app]} alt={APP_INFO[app].name} className="h-16 w-16 mx-auto rounded-full border border-aura-100 object-contain bg-white" />
            <div className="text-sm font-bold mt-2">{APP_INFO[app].name}</div>
            <p className="text-[11px] text-aura-700/70 mt-0.5 mb-3">{descriptions[app]}</p>
            <div className="flex flex-col items-center gap-1.5">
              <label className={`btn-secondary !px-3 !py-1.5 text-xs cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                {busy === app ? 'Envoi…' : 'Changer le logo'}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onFile(app, e)} disabled={busy !== null} />
              </label>
              {logos[app] !== APP_INFO[app].defaultLogo && (
                <button className="text-[11px] text-aura-700 underline" onClick={() => onReset(app)} disabled={busy !== null}>
                  Logo par défaut
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {message && <p className="text-sm text-emerald-700 mt-3">{message}</p>}
      {error && <p className="text-sm text-coral-600 mt-3">{error}</p>}
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
  const [stockRole, setStockRole] = useState<'defaut' | StockAccess['role']>(user.stock_access?.role ?? 'defaut')
  const [stockPerms, setStockPerms] = useState<NonNullable<StockAccess['permissions']>>(
    user.stock_access?.permissions ?? { entrees: true, sorties: true, espaces: true, facturation: false, compta: false, grille: false },
  )
  const [adherentId, setAdherentId] = useState(user.stock_access?.adherent_id ?? '')
  const [perms, setPerms] = useState<DetailedPerms>(user.perms ?? {})
  const [disabled, setDisabled] = useState(!!user.disabled)
  const [isCompta, setIsCompta] = useState(!!user.is_compta)
  const [cpDroits, setCpDroits] = useState(String(user.cp_droits ?? 25))
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
      const stock_access: StockAccess | null =
        role === 'admin' || stockRole === 'defaut'
          ? null
          : stockRole === 'logisticien'
            ? { role: 'logisticien', permissions: stockPerms }
            : stockRole === 'adherent'
              ? { role: 'adherent', adherent_id: adherentId.trim() || null }
              : { role: 'admin' }
      await update('profiles', user.id, {
        role,
        instance_id: instanceId || null,
        modules: role === 'admin' || allModules ? null : moduleKeys,
        stock_access,
        perms: role === 'admin' || Object.keys(perms).length === 0 ? null : perms,
        disabled: isSelf ? false : disabled,
        is_compta: isCompta,
        cp_droits: Number(cpDroits) || 25,
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
              <label className="label">Autorisations détaillées</label>
              <p className="text-[11px] text-aura-700/60 mb-2">
                Décochez pour interdire l'action à ce salarié (il gardera la consultation).
              </p>
              <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-aura-100 p-3">
                {PERM_DETAILS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={perms[key] !== false}
                      onChange={() =>
                        setPerms((p) => {
                          const next = { ...p }
                          if (next[key] === false) delete next[key]
                          else next[key] = false
                          return next
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Accès Planet'Stock (stockage & picking)</label>
              <p className="text-[11px] text-aura-700/60 mb-2">
                S'applique si le module « Planet'Stock » est coché ci-dessus. « Par défaut » :
                correspondance par email avec un utilisateur ou adhérent du stock.
              </p>
              <select className="input mb-2" value={stockRole} onChange={(e) => setStockRole(e.target.value as typeof stockRole)}>
                <option value="defaut">Par défaut (correspondance par email)</option>
                <option value="admin">Administrateur du stock (tout)</option>
                <option value="logisticien">Logisticien (onglets choisis)</option>
                <option value="adherent">Adhérent (son espace uniquement)</option>
              </select>
              {stockRole === 'logisticien' && (
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-aura-100 p-3">
                  {([
                    ['entrees', 'Entrées & références'],
                    ['sorties', 'Sorties'],
                    ['espaces', 'Espaces de stockage'],
                    ['facturation', 'Relevés'],
                    ['compta', 'Compta matière'],
                    ['grille', 'Tarifs'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!stockPerms[key]}
                        onChange={() => setStockPerms((p) => ({ ...p, [key]: !p[key] }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              {stockRole === 'adherent' && (
                <div>
                  <input
                    className="input"
                    value={adherentId}
                    onChange={(e) => setAdherentId(e.target.value)}
                    placeholder="ID de la fiche adhérent (ex. ADH001) — sinon correspondance par email"
                  />
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

        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCompta} onChange={(e) => setIsCompta(e.target.checked)} />
            Service compta (valide les congés après l'admin)
          </label>
          <div>
            <label className="label">Droits de congés payés (jours / an)</label>
            <input type="number" className="input" min={0} step={0.5} value={cpDroits} onChange={(e) => setCpDroits(e.target.value)} />
          </div>
        </div>

        {!isSelf && (
          <div className="rounded-lg border border-coral-500/30 p-3 space-y-2">
            <div className="text-xs font-bold text-coral-600 uppercase tracking-wide">Zone sensible</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
              Désactiver l'accès (le salarié ne peut plus se connecter, ses données sont conservées)
            </label>
            <button
              className="text-sm text-coral-600 underline"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Supprimer définitivement le compte de ${user.full_name} ?`)) return
                if (!confirm("Cette action est irréversible (ses attributions et notifications sont supprimées ; ses tâches et documents restent, sans auteur). NOTE : son compte de connexion Supabase subsiste — pour l'effacer aussi, supprimez l'utilisateur dans Supabase → Authentication → Users. Confirmer ?")) return
                setBusy(true)
                try {
                  await remove('profiles', user.id)
                  onSaved()
                } finally {
                  setBusy(false)
                }
              }}
            >
              Supprimer définitivement ce compte
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  )
}
