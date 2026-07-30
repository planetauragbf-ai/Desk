import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import { notify } from '../lib/notify'
import { formatDate } from '../lib/format'
import type { Leave, LeaveStatus, LeaveType, TimeEntry } from '../lib/types'
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
  const [editCell, setEditCell] = useState<{ profileId: string; date: string } | null>(null)
  const [showTime, setShowTime] = useState(false)

  const { rows: leaves, refresh } = useTable('leaves', undefined, { column: 'created_at', ascending: false })
  const { rows: profiles } = useTable('profiles', undefined, { column: 'full_name', ascending: true })
  const { rows: timeEntries, refresh: refreshTime } = useTable('time_entries', undefined, { column: 'date', ascending: false })

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

  // Admins et service compta ont la main sur le planning (clic sur une case).
  const canEditPlanning = isAdmin || isCompta

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

  const shiftDay = (iso: string, delta: number) => {
    const d = new Date(iso)
    d.setDate(d.getDate() + delta)
    return toIso(d)
  }

  /** Retire un jour d'une absence existante (suppression, troncature ou découpe). */
  async function removeDayFromLeave(l: Leave, iso: string) {
    if (l.start_date === l.end_date) {
      await remove('leaves', l.id)
    } else if (iso === l.start_date) {
      await update('leaves', l.id, { start_date: shiftDay(iso, 1) })
    } else if (iso === l.end_date) {
      await update('leaves', l.id, { end_date: shiftDay(iso, -1) })
    } else {
      await update('leaves', l.id, { end_date: shiftDay(iso, -1) })
      await insert('leaves', {
        profile_id: l.profile_id,
        type: l.type,
        start_date: shiftDay(iso, 1),
        end_date: l.end_date,
        reason: l.reason,
        status: l.status,
        admin_by: l.admin_by,
        admin_at: l.admin_at,
        compta_by: l.compta_by,
        compta_at: l.compta_at,
      })
    }
  }

  /** Admin/compta : fixe la case (présence ou code d'absence) directement. */
  async function setCell(profileId: string, iso: string, type: LeaveType | 'presence') {
    const existing = leaves.filter(
      (l) => l.profile_id === profileId && l.status !== 'refusee' && l.start_date <= iso && l.end_date >= iso,
    )
    for (const l of existing) await removeDayFromLeave(l, iso)
    if (type !== 'presence') {
      const now = new Date().toISOString()
      await insert('leaves', {
        profile_id: profileId,
        type,
        start_date: iso,
        end_date: iso,
        reason: 'Saisie planning',
        status: 'validee',
        admin_by: profile?.id ?? null,
        admin_at: now,
        compta_by: profile?.id ?? null,
        compta_at: now,
      })
    }
    setEditCell(null)
    refresh()
  }

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

  // ---- Heures supp & retards (à la minute), pour le mois affiché ----
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const monthEntries = timeEntries.filter((e) => e.date.startsWith(monthPrefix))
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`)
  const totalFor = (profileId: string, kind: TimeEntry['kind']) =>
    monthEntries.filter((e) => e.profile_id === profileId && e.kind === kind).reduce((s, e) => s + e.minutes, 0)

  async function addTimeEntry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const minutes = Number(fd.get('hours') || 0) * 60 + Number(fd.get('minutes') || 0)
    if (minutes <= 0) return alert('Indiquez une durée.')
    await insert('time_entries', {
      profile_id: canEditPlanning ? String(fd.get('profile_id')) || profile!.id : profile!.id,
      kind: String(fd.get('kind')) as TimeEntry['kind'],
      date: String(fd.get('date')),
      minutes,
      note: String(fd.get('note') ?? ''),
      created_by: profile?.id ?? null,
    })
    setShowTime(false)
    refreshTime()
  }

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
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded text-[8px] font-bold text-center leading-4 bg-aura-100 text-aura-700">P</span>
            Présence
          </span>
          {Object.values(TYPES).map((t) => (
            <span key={t.code} className="inline-flex items-center gap-1">
              <span className={`inline-block w-4 h-4 rounded text-[8px] font-bold text-center leading-4 ${t.color}`}>{t.code[0]}</span>
              {t.label}
            </span>
          ))}
          <span className="text-aura-700/60">· transparent = en attente de validation</span>
          {canEditPlanning && <span className="text-accent-500 font-semibold">· cliquez sur une case pour la modifier</span>}
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
                      <td
                        key={d.getDate()}
                        onClick={canEditPlanning && !weekend ? () => setEditCell({ profileId: p.id, date: toIso(d) }) : undefined}
                        className={`border border-aura-100 p-0.5 text-center ${weekend ? 'bg-aura-50' : ''} ${
                          canEditPlanning && !weekend ? 'cursor-pointer hover:bg-accent-500/10' : ''
                        }`}
                      >
                        {t ? (
                          <span
                            title={`${t.label} — ${STATUS_LABELS[l!.status]}`}
                            className={`block rounded text-[9px] font-bold py-0.5 ${t.color} ${l!.status !== 'validee' ? 'opacity-40' : ''}`}
                          >
                            {t.code}
                          </span>
                        ) : !weekend ? (
                          <span className="block rounded text-[9px] font-semibold py-0.5 text-aura-700/40">P</span>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={<span>⏱ Heures supp & retards — <span className="capitalize">{monthName(month)}</span></span>}
        action={<button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setShowTime(true)}>+ Ajouter</button>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr>
                <th className="table-head rounded-l-lg text-left">Salarié</th>
                <th className="table-head text-right">Heures supp</th>
                <th className="table-head rounded-r-lg text-right">Retards</th>
              </tr>
            </thead>
            <tbody>
              {activeProfiles
                .filter((p) => totalFor(p.id, 'hsupp') > 0 || totalFor(p.id, 'retard') > 0)
                .map((p) => (
                  <tr key={p.id}>
                    <td className="table-cell text-xs font-semibold">{p.full_name}</td>
                    <td className="table-cell text-right text-emerald-700 font-semibold">
                      {totalFor(p.id, 'hsupp') ? `+ ${fmtMin(totalFor(p.id, 'hsupp'))}` : '—'}
                    </td>
                    <td className="table-cell text-right text-coral-600 font-semibold">
                      {totalFor(p.id, 'retard') ? fmtMin(totalFor(p.id, 'retard')) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {monthEntries.length === 0 && <EmptyState>Aucune heure supp ni retard saisi ce mois-ci.</EmptyState>}
        </div>
        {monthEntries.length > 0 && (
          <div className="mt-3 border-t border-aura-100 pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-aura-700/60 mb-1.5">Détail du mois</div>
            <ul className="space-y-1">
              {monthEntries.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-xs border-b border-aura-100/60 pb-1 last:border-0">
                  <span className="w-20 text-aura-700/70">{formatDate(e.date)}</span>
                  <span className="font-semibold">{personName(e.profile_id)}</span>
                  <span className={e.kind === 'hsupp' ? 'text-emerald-700' : 'text-coral-600'}>
                    {e.kind === 'hsupp' ? `+ ${fmtMin(e.minutes)} supp` : `retard ${fmtMin(e.minutes)}`}
                  </span>
                  {e.note && <span className="text-aura-700/60 truncate">· {e.note}</span>}
                  {(canEditPlanning || e.profile_id === profile?.id) && (
                    <button
                      className="ml-auto text-coral-600/70 hover:text-coral-600"
                      onClick={async () => { if (confirm('Supprimer cette saisie ?')) { await remove('time_entries', e.id); refreshTime() } }}
                      aria-label="Supprimer"
                    >🗑</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-1 gap-5">
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
      </div>

      {editCell && (
        <Modal
          title={`${personName(editCell.profileId)} — ${formatDate(editCell.date)}`}
          onClose={() => setEditCell(null)}
        >
          <p className="text-sm text-aura-700/80 mb-3">Choisissez ce que vous voulez marquer sur cette journée :</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-lg border border-aura-100 px-3 py-2 text-sm font-semibold hover:border-accent-500 text-left"
              onClick={() => setCell(editCell.profileId, editCell.date, 'presence')}
            >
              <span className="inline-block w-5 h-5 rounded bg-aura-100 text-aura-700 text-[10px] font-bold text-center leading-5 mr-2">P</span>
              Présence
            </button>
            {Object.entries(TYPES).map(([k, t]) => (
              <button
                key={k}
                className="rounded-lg border border-aura-100 px-3 py-2 text-sm font-semibold hover:border-accent-500 text-left"
                onClick={() => setCell(editCell.profileId, editCell.date, k as LeaveType)}
              >
                <span className={`inline-block w-5 h-5 rounded text-[10px] font-bold text-center leading-5 mr-2 ${t.color}`}>{t.code[0]}</span>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-aura-700/60 mt-3">
            La saisie directe est validée immédiatement (admin / compta). « Présence » retire l'absence
            existante sur cette journée.
          </p>
        </Modal>
      )}

      {showTime && (
        <Modal title="Heures supp / retard (à la minute)" onClose={() => setShowTime(false)}>
          <form onSubmit={addTimeEntry} className="space-y-3">
            {canEditPlanning && (
              <div>
                <label className="label">Salarié</label>
                <select name="profile_id" className="input" defaultValue={profile?.id}>
                  {activeProfiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type *</label>
                <select name="kind" className="input" required defaultValue="hsupp">
                  <option value="hsupp">Heures supplémentaires</option>
                  <option value="retard">Retard</option>
                </select>
              </div>
              <div>
                <label className="label">Date *</label>
                <input type="date" name="date" className="input" required defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Heures</label>
                <input type="number" name="hours" className="input" min={0} defaultValue={0} />
              </div>
              <div>
                <label className="label">Minutes</label>
                <input type="number" name="minutes" className="input" min={0} max={59} defaultValue={0} />
              </div>
            </div>
            <div>
              <label className="label">Note</label>
              <input name="note" className="input" placeholder="ex. préparation salon, panne de train…" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowTime(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}

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
