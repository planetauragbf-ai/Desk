import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import { notify } from '../lib/notify'
import { formatDate } from '../lib/format'
import type { Leave, LeaveStatus, LeaveType } from '../lib/types'
import { Card, EmptyState, Modal } from '../components/ui'

// Types alignés sur le planning salariés (P/C/M/E/FORM/TT/RC…)
const TYPES: Record<LeaveType, { code: string; label: string; color: string }> = {
  conge: { code: 'C', label: 'Congé', color: 'bg-emerald-500 text-white' },
  maladie: { code: 'M', label: 'Maladie', color: 'bg-coral-500 text-white' },
  ecole: { code: 'E', label: 'École', color: 'bg-violet-500 text-white' },
  formation: { code: 'FORM', label: 'Formation', color: 'bg-indigo-500 text-white' },
  teletravail: { code: 'TT', label: 'Télétravail', color: 'bg-sky-500 text-white' },
  recup: { code: 'RC', label: 'Récup', color: 'bg-teal-500 text-white' },
  absence: { code: 'ABS', label: 'Absence', color: 'bg-amber-500 text-white' },
  retard: { code: 'R', label: 'Retard', color: 'bg-orange-500 text-white' },
}

const STATUS_LABELS: Record<LeaveStatus, string> = {
  en_attente: 'En attente (admin)',
  validee_admin: 'En attente (compta)',
  validee: 'Validée',
  refusee: 'Refusée',
}

const STATUS_BADGES: Record<LeaveStatus, string> = {
  en_attente: 'bg-amber-100 text-amber-800',
  validee_admin: 'bg-sky-100 text-sky-800',
  validee: 'bg-emerald-100 text-emerald-800',
  refusee: 'bg-coral-500/15 text-coral-600',
}

const monthName = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
const toIso = (d: Date) => d.toISOString().slice(0, 10)

export default function CalendarPage() {
  const { profile } = useAuth()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [showNew, setShowNew] = useState(false)

  const { rows: leaves, refresh } = useTable('leaves', undefined, { column: 'created_at', ascending: false })
  const { rows: profiles } = useTable('profiles', undefined, { column: 'full_name', ascending: true })

  const isAdmin = profile?.role === 'admin'
  const isCompta = !!profile?.is_compta
  const activeProfiles = profiles.filter((p) => !p.disabled)

  const days = useMemo(() => {
    const out: Date[] = []
    const d = new Date(month)
    while (d.getMonth() === month.getMonth()) {
      out.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [month])

  // Congés affichés dans le planning : validés (plein) et en cours de
  // validation (hachuré/transparent).
  const cellLeave = (profileId: string, day: Date): Leave | null => {
    const iso = toIso(day)
    return (
      leaves.find(
        (l) => l.profile_id === profileId && l.status !== 'refusee' && l.start_date <= iso && l.end_date >= iso,
      ) ?? null
    )
  }

  const myLeaves = leaves.filter((l) => l.profile_id === profile?.id)
  const pendingAdmin = leaves.filter((l) => l.status === 'en_attente')
  const pendingCompta = leaves.filter((l) => l.status === 'validee_admin')

  // Soldes CP de l'année en cours (jours ouvrés approximés : lun-ven).
  const workingDays = (l: Leave) => {
    let n = 0
    const d = new Date(l.start_date)
    const end = new Date(l.end_date)
    while (d <= end) {
      if (d.getDay() !== 0 && d.getDay() !== 6) n++
      d.setDate(d.getDate() + 1)
    }
    return n
  }
  const year = new Date().getFullYear()
  const cpTaken = (profileId: string) =>
    leaves
      .filter((l) => l.profile_id === profileId && l.type === 'conge' && l.status === 'validee' && l.start_date.startsWith(String(year)))
      .reduce((s, l) => s + workingDays(l), 0)

  async function requestLeave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const forId = isAdmin ? String(fd.get('profile_id')) || profile!.id : profile!.id
    const created = await insert('leaves', {
      profile_id: forId,
      type: String(fd.get('type')) as LeaveType,
      start_date: String(fd.get('start_date')),
      end_date: String(fd.get('end_date') || fd.get('start_date')),
      reason: String(fd.get('reason') ?? ''),
      status: 'en_attente',
    })
    // Prévenir les administrateurs.
    const who = profiles.find((p) => p.id === forId)?.full_name ?? 'Un salarié'
    await Promise.all(
      profiles
        .filter((p) => p.role === 'admin' && p.id !== profile?.id)
        .map((p) => notify(p.id, `📅 ${who} demande : ${TYPES[created.type].label} du ${formatDate(created.start_date)} au ${formatDate(created.end_date)}`, '/calendrier')),
    )
    setShowNew(false)
    refresh()
  }

  async function approveAdmin(l: Leave) {
    await update('leaves', l.id, { status: 'validee_admin', admin_by: profile!.id, admin_at: new Date().toISOString() })
    await Promise.all(
      profiles.filter((p) => p.is_compta && p.id !== profile?.id).map((p) =>
        notify(p.id, `📅 Demande de ${profiles.find((x) => x.id === l.profile_id)?.full_name ?? '—'} à valider (compta)`, '/calendrier'),
      ),
    )
    refresh()
  }

  async function approveCompta(l: Leave) {
    await update('leaves', l.id, { status: 'validee', compta_by: profile!.id, compta_at: new Date().toISOString() })
    await notify(l.profile_id, `✅ Votre demande (${TYPES[l.type].label} du ${formatDate(l.start_date)}) est validée`, '/calendrier')
    refresh()
  }

  async function refuse(l: Leave) {
    const reason = prompt('Motif du refus (transmis au salarié) :')
    if (reason === null) return
    await update('leaves', l.id, { status: 'refusee', refusal_reason: reason })
    await notify(l.profile_id, `❌ Votre demande (${TYPES[l.type].label} du ${formatDate(l.start_date)}) a été refusée${reason ? ` : ${reason}` : ''}`, '/calendrier')
    refresh()
  }

  const personName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? '—'

  function ValidationList({ items, stage }: { items: Leave[]; stage: 'admin' | 'compta' }) {
    if (items.length === 0) return <EmptyState>Aucune demande en attente.</EmptyState>
    return (
      <ul className="space-y-2.5">
        {items.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-aura-100 pb-2.5 last:border-0">
            <div className="flex-1 min-w-52">
              <div className="text-sm font-semibold">
                {personName(l.profile_id)} — {TYPES[l.type].label}
              </div>
              <div className="text-xs text-aura-700/70">
                Du {formatDate(l.start_date)} au {formatDate(l.end_date)} ({workingDays(l)} j ouvrés)
                {l.reason && <> · {l.reason}</>}
                {stage === 'compta' && <> · validé par {personName(l.admin_by)}</>}
              </div>
            </div>
            <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => (stage === 'admin' ? approveAdmin(l) : approveCompta(l))}>
              ✔ Valider
            </button>
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => refuse(l)}>✘ Refuser</button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Calendrier & congés</h1>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Faire une demande</button>
      </div>

      {(isAdmin || isCompta) && (pendingAdmin.length > 0 || pendingCompta.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-5">
          {isAdmin && (
            <Card title={<span className="text-amber-700">⚖ À valider — Admin ({pendingAdmin.length})</span>}>
              <ValidationList items={pendingAdmin} stage="admin" />
            </Card>
          )}
          {isCompta && (
            <Card title={<span className="text-sky-700">🧮 À valider — Service compta ({pendingCompta.length})</span>}>
              <ValidationList items={pendingCompta} stage="compta" />
            </Card>
          )}
        </div>
      )}

      <Card
        title={
          <span className="capitalize">{monthName(month)}</span>
        }
        action={
          <div className="flex gap-1.5">
            <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd'hui</button>
            <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
          {Object.values(TYPES).map((t) => (
            <span key={t.code} className="inline-flex items-center gap-1">
              <span className={`inline-block w-4 h-4 rounded text-[8px] font-bold text-center leading-4 ${t.color}`}>{t.code[0]}</span>
              {t.label}
            </span>
          ))}
          <span className="text-aura-700/60">· transparent = en attente de validation</span>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="table-head sticky left-0 bg-aura-50 z-10 min-w-36 text-left">Salarié</th>
                {days.map((d) => (
                  <th
                    key={d.getDate()}
                    className={`text-[10px] font-semibold px-1 py-1 text-center min-w-7 ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-aura-100 text-aura-700/50' : 'bg-aura-50 text-aura-700'}`}
                  >
                    <div>{['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getDay()]}</div>
                    <div>{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeProfiles.map((p) => (
                <tr key={p.id}>
                  <td className="table-cell sticky left-0 bg-white z-10 text-xs font-semibold whitespace-nowrap">{p.full_name}</td>
                  {days.map((d) => {
                    const weekend = d.getDay() === 0 || d.getDay() === 6
                    const l = cellLeave(p.id, d)
                    const t = l ? TYPES[l.type] : null
                    return (
                      <td key={d.getDate()} className={`border border-aura-100 p-0.5 text-center ${weekend ? 'bg-aura-50' : ''}`}>
                        {t && (
                          <span
                            title={`${t.label} — ${STATUS_LABELS[l!.status]}`}
                            className={`block rounded text-[9px] font-bold py-0.5 ${t.color} ${l!.status !== 'validee' ? 'opacity-40' : ''}`}
                          >
                            {t.code}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Mes demandes">
          {myLeaves.length === 0 ? (
            <EmptyState>Aucune demande. Utilisez « + Faire une demande ».</EmptyState>
          ) : (
            <ul className="space-y-2">
              {myLeaves.slice(0, 10).map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm border-b border-aura-100 pb-2 last:border-0">
                  <span className="flex-1">
                    {TYPES[l.type].label} du {formatDate(l.start_date)} au {formatDate(l.end_date)}
                    {l.refusal_reason && <span className="text-xs text-coral-600"> — {l.refusal_reason}</span>}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_BADGES[l.status]}`}>
                    {STATUS_LABELS[l.status]}
                  </span>
                  {l.status === 'en_attente' && (
                    <button
                      className="text-xs text-coral-600 underline"
                      onClick={async () => { if (confirm('Annuler cette demande ?')) { await remove('leaves', l.id); refresh() } }}
                    >
                      Annuler
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Soldes de congés ${year}`}>
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head rounded-l-lg text-left">Salarié</th>
                <th className="table-head text-right">Droits</th>
                <th className="table-head text-right">Pris</th>
                <th className="table-head rounded-r-lg text-right">Solde</th>
              </tr>
            </thead>
            <tbody>
              {(isAdmin || isCompta ? activeProfiles : activeProfiles.filter((p) => p.id === profile?.id)).map((p) => {
                const taken = cpTaken(p.id)
                const droits = p.cp_droits ?? 25
                return (
                  <tr key={p.id}>
                    <td className="table-cell text-xs font-semibold">{p.full_name}</td>
                    <td className="table-cell text-right">{droits}</td>
                    <td className="table-cell text-right">{taken}</td>
                    <td className={`table-cell text-right font-bold ${droits - taken < 0 ? 'text-coral-600' : ''}`}>{droits - taken}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {showNew && (
        <Modal title="Demande de congé / absence" onClose={() => setShowNew(false)}>
          <form onSubmit={requestLeave} className="space-y-3">
            {isAdmin && (
              <div>
                <label className="label">Salarié concerné</label>
                <select name="profile_id" className="input" defaultValue={profile?.id}>
                  {activeProfiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Type *</label>
              <select name="type" className="input" required defaultValue="conge">
                {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Du *</label>
                <input type="date" name="start_date" className="input" required />
              </div>
              <div>
                <label className="label">Au</label>
                <input type="date" name="end_date" className="input" />
              </div>
            </div>
            <div>
              <label className="label">Motif / précision</label>
              <input name="reason" className="input" placeholder="Optionnel" />
            </div>
            <p className="text-[11px] text-aura-700/60">
              La demande est envoyée à l'administrateur, puis au service compta pour validation finale.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Envoyer la demande</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
