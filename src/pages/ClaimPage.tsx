import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import { supabase } from '../lib/supabase'
import { notify } from '../lib/notify'
import { formatDate, formatDateTime, profileName } from '../lib/format'
import type { Claim, ClaimCategory, ClaimKind, ClaimStatus, Priority } from '../lib/types'
import { Card, EmptyState, Modal, StatTile } from '../components/ui'

const KINDS: Record<ClaimKind, string> = { sinistre: 'Sinistre', litige: 'Litige' }

const CATEGORIES: Record<ClaimCategory, string> = {
  casse: '🍷 Casse',
  perte: '📦 Perte',
  vol: '🚨 Vol',
  retard: '⏰ Retard de livraison',
  temperature: '🌡 Température / vin altéré',
  erreur_livraison: '📍 Erreur de livraison',
  facturation: '🧾 Litige de facturation',
  autre: '❓ Autre',
}

const STATUSES: Record<ClaimStatus, { label: string; badge: string }> = {
  nouveau: { label: 'Nouveau', badge: 'bg-aura-100 text-aura-800' },
  en_cours: { label: 'En instruction', badge: 'bg-sky-100 text-sky-800' },
  attente_transporteur: { label: 'Attente transporteur', badge: 'bg-amber-100 text-amber-800' },
  attente_assurance: { label: 'Attente assurance', badge: 'bg-amber-100 text-amber-800' },
  attente_client: { label: 'Attente client', badge: 'bg-amber-100 text-amber-800' },
  accepte: { label: 'Accepté / indemnisé', badge: 'bg-emerald-100 text-emerald-800' },
  refuse: { label: 'Refusé', badge: 'bg-coral-500/15 text-coral-600' },
  clos: { label: 'Clos', badge: 'bg-aura-100 text-aura-700/70' },
}

const PRIORITIES: Record<Priority, string> = { basse: 'Basse', moyenne: 'Moyenne', haute: 'Haute', critique: 'Critique' }
const CARRIERS = ['', 'UPS', 'FedEx', 'DHL', 'TNT', 'GLS', 'Colissimo', 'Chronopost', 'DPD', 'Autre']
const OPEN_STATUSES: ClaimStatus[] = ['nouveau', 'en_cours', 'attente_transporteur', 'attente_assurance', 'attente_client']

const eur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)

async function uploadClaimFile(file: File): Promise<{ url: string; name: string }> {
  if (supabase) {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('claims').upload(path, file, { contentType: file.type })
    if (error) throw new Error(`${error.message} — vérifiez que le bucket « claims » existe (migration 0015).`)
    const { data } = supabase.storage.from('claims').getPublicUrl(path)
    return { url: data.publicUrl, name: file.name }
  }
  if (file.size > 1_500_000) throw new Error('En mode démo, les fichiers doivent faire moins de 1,5 Mo.')
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Lecture impossible'))
    r.readAsDataURL(file)
  })
  return { url, name: file.name }
}

export default function ClaimPage() {
  const { profile } = useAuth()
  const [showNew, setShowNew] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [carrierFilter, setCarrierFilter] = useState('')

  const { rows: claims, refresh } = useTable('claims', undefined, { column: 'created_at', ascending: false })
  const { rows: events, refresh: refreshEvents } = useTable('claim_events', undefined, { column: 'created_at', ascending: true })
  const { rows: profiles } = useTable('profiles', undefined, { column: 'full_name', ascending: true })

  const detail = claims.find((c) => c.id === detailId) ?? null

  // ---- Statistiques
  const open = claims.filter((c) => OPEN_STATUSES.includes(c.status))
  const waiting = claims.filter((c) => c.status.startsWith('attente'))
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const urgent = open.filter((c) => c.deadline && c.deadline <= soon)
  const totalReclame = claims.reduce((s, c) => s + (c.montant_reclame || 0), 0)
  const totalRecupere = claims.reduce((s, c) => s + (c.montant_recupere || 0), 0)
  const taux = totalReclame ? Math.round((totalRecupere / totalReclame) * 100) : 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return claims.filter(
      (c) =>
        (!statusFilter || c.status === statusFilter) &&
        (!kindFilter || c.kind === kindFilter) &&
        (!carrierFilter || c.carrier === carrierFilter) &&
        (!q ||
          [c.ref, c.title, c.description, c.shipping_ref, c.tracking_number, c.adherent, c.destinataire, c.pays]
            .some((s) => (s ?? '').toLowerCase().includes(q))),
    )
  }, [claims, search, statusFilter, kindFilter, carrierFilter])

  const nextRef = (kind: ClaimKind) => {
    const year = new Date().getFullYear()
    const prefix = kind === 'sinistre' ? 'SIN' : 'LIT'
    const n = claims.filter((c) => c.kind === kind && c.ref.includes(String(year))).length + 1
    return `${prefix}-${year}-${String(n).padStart(3, '0')}`
  }

  async function addEvent(claimId: string, kind: 'commentaire' | 'statut' | 'document', content: string, file?: { url: string; name: string }) {
    await insert('claim_events', {
      claim_id: claimId,
      author_id: profile?.id ?? null,
      kind,
      content,
      file_url: file?.url ?? null,
      file_name: file?.name ?? null,
    })
    refreshEvents()
  }

  async function createClaim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const kind = String(fd.get('kind')) as ClaimKind
    const assignee = String(fd.get('assignee_id')) || null
    const created = await insert('claims', {
      ref: nextRef(kind),
      kind,
      category: String(fd.get('category')) as ClaimCategory,
      status: 'nouveau',
      priority: String(fd.get('priority')) as Priority,
      title: String(fd.get('title')),
      description: String(fd.get('description') ?? ''),
      shipping_ref: String(fd.get('shipping_ref') ?? ''),
      tracking_number: String(fd.get('tracking_number') ?? ''),
      carrier: String(fd.get('carrier') ?? ''),
      adherent: String(fd.get('adherent') ?? ''),
      destinataire: String(fd.get('destinataire') ?? ''),
      pays: String(fd.get('pays') ?? ''),
      date_incident: String(fd.get('date_incident')) || null,
      deadline: String(fd.get('deadline')) || null,
      montant_estime: Number(fd.get('montant_estime') || 0),
      montant_reclame: Number(fd.get('montant_reclame') || 0),
      assureur: String(fd.get('assureur') ?? ''),
      assignee_id: assignee,
      created_by: profile?.id ?? null,
    })
    await addEvent(created.id, 'statut', `Dossier ouvert (${KINDS[kind]})`)
    if (assignee && assignee !== profile?.id) {
      await notify(assignee, `🛡 Dossier ${created.ref} « ${created.title} » vous a été attribué`, '/claim')
    }
    setShowNew(false)
    refresh()
    setDetailId(created.id)
  }

  async function changeStatus(c: Claim, status: ClaimStatus) {
    const closed = status === 'clos' || status === 'accepte' || status === 'refuse'
    await update('claims', c.id, { status, closed_at: closed ? new Date().toISOString() : null })
    await addEvent(c.id, 'statut', `Statut : ${STATUSES[c.status].label} → ${STATUSES[status].label}`)
    if (c.assignee_id && c.assignee_id !== profile?.id) {
      await notify(c.assignee_id, `🛡 ${c.ref} : ${STATUSES[status].label}`, '/claim')
    }
    refresh()
  }

  async function saveDetail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!detail) return
    const fd = new FormData(e.currentTarget)
    await update('claims', detail.id, {
      priority: String(fd.get('priority')) as Priority,
      assignee_id: String(fd.get('assignee_id')) || null,
      deadline: String(fd.get('deadline')) || null,
      montant_estime: Number(fd.get('montant_estime') || 0),
      montant_reclame: Number(fd.get('montant_reclame') || 0),
      montant_recupere: Number(fd.get('montant_recupere') || 0),
      assureur: String(fd.get('assureur') ?? ''),
      description: String(fd.get('description') ?? ''),
    })
    refresh()
  }

  async function uploadDoc(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !detail) return
    try {
      const up = await uploadClaimFile(file)
      await addEvent(detail.id, 'document', `Pièce jointe : ${up.name}`, up)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  async function addComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!detail) return
    const fd = new FormData(e.currentTarget)
    const content = String(fd.get('comment')).trim()
    if (!content) return
    e.currentTarget.reset()
    await addEvent(detail.id, 'commentaire', content)
  }

  function exportCsv() {
    const cols = ['ref', 'kind', 'category', 'status', 'priority', 'title', 'shipping_ref', 'tracking_number', 'carrier', 'adherent', 'destinataire', 'pays', 'date_incident', 'deadline', 'montant_estime', 'montant_reclame', 'montant_recupere', 'assureur', 'created_at'] as const
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cols.join(';'), ...filtered.map((c) => cols.map((k) => esc(c[k])).join(';'))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `planet-claim-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const detailEvents = events.filter((ev) => ev.claim_id === detailId)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Sinistres & litiges</h1>
          <p className="text-sm text-aura-700/80 mt-1">Déclaration, instruction, réclamations transporteurs et assurance, indemnisations.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv}>⇩ Export CSV</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Déclarer un dossier</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Dossiers ouverts" value={open.length} />
        <StatTile label="En attente de tiers" value={waiting.length} />
        <StatTile label="Échéance < 7 j" value={urgent.length} tone={urgent.length ? 'alert' : 'default'} />
        <StatTile label="Montant réclamé" value={eur(totalReclame)} />
        <StatTile label="Montant récupéré" value={eur(totalRecupere)} tone={totalRecupere ? 'ok' : 'default'} />
        <StatTile label="Taux de récupération" value={`${taux} %`} tone={taux >= 50 ? 'ok' : 'default'} />
      </div>

      {urgent.length > 0 && (
        <Card title={<span className="text-coral-600">⏳ Délais de réclamation proches</span>}>
          <ul className="space-y-1.5">
            {urgent.map((c) => (
              <li key={c.id} className="text-sm flex flex-wrap items-center gap-2">
                <button className="font-semibold underline" onClick={() => setDetailId(c.id)}>{c.ref}</button>
                <span className="flex-1 truncate">{c.title}</span>
                <span className="text-coral-600 font-semibold whitespace-nowrap">limite {formatDate(c.deadline)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <input className="input max-w-56" placeholder="Rechercher (réf, titre, tracking…)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input max-w-44" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="">Sinistres & litiges</option>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
          </select>
          <select className="input max-w-52" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input max-w-44" value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}>
            <option value="">Tous transporteurs</option>
            {CARRIERS.filter(Boolean).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState>Aucun dossier. Déclarez le premier sinistre ou litige avec « + Déclarer un dossier ».</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg">Réf</th>
                  <th className="table-head">Dossier</th>
                  <th className="table-head">Catégorie</th>
                  <th className="table-head">Transporteur</th>
                  <th className="table-head">Adhérent</th>
                  <th className="table-head">Statut</th>
                  <th className="table-head text-right">Réclamé</th>
                  <th className="table-head text-right">Récupéré</th>
                  <th className="table-head">Limite</th>
                  <th className="table-head rounded-r-lg">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-aura-50/60 cursor-pointer" onClick={() => setDetailId(c.id)}>
                    <td className="table-cell font-mono text-xs font-bold whitespace-nowrap">{c.ref}</td>
                    <td className="table-cell">
                      <div className="font-semibold text-sm">{c.title}</div>
                      <div className="text-[11px] text-aura-700/60">{c.shipping_ref && `Exp. ${c.shipping_ref} · `}{c.pays}</div>
                    </td>
                    <td className="table-cell text-xs whitespace-nowrap">{CATEGORIES[c.category]}</td>
                    <td className="table-cell text-xs">{c.carrier || '—'}</td>
                    <td className="table-cell text-xs">{c.adherent || '—'}</td>
                    <td className="table-cell">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUSES[c.status].badge}`}>
                        {STATUSES[c.status].label}
                      </span>
                    </td>
                    <td className="table-cell text-right text-xs font-semibold">{c.montant_reclame ? eur(c.montant_reclame) : '—'}</td>
                    <td className="table-cell text-right text-xs font-semibold text-emerald-700">{c.montant_recupere ? eur(c.montant_recupere) : '—'}</td>
                    <td className={`table-cell text-xs whitespace-nowrap ${c.deadline && c.deadline <= soon && OPEN_STATUSES.includes(c.status) ? 'text-coral-600 font-bold' : ''}`}>
                      {formatDate(c.deadline)}
                    </td>
                    <td className="table-cell text-xs">{profileName(profiles, c.assignee_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showNew && (
        <Modal title="Déclarer un sinistre / litige" onClose={() => setShowNew(false)}>
          <form onSubmit={createClaim} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type *</label>
                <select name="kind" className="input" defaultValue="sinistre">
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Catégorie *</label>
                <select name="category" className="input" defaultValue="casse">
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Titre du dossier *</label>
              <input name="title" className="input" required placeholder="ex. 6 btl cassées — commande 6060 UPS" />
            </div>
            <div>
              <label className="label">Description des faits</label>
              <textarea name="description" className="input" rows={3} placeholder="Circonstances, constat, réserves émises…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">N° expédition</label><input name="shipping_ref" className="input" placeholder="ex. 6060" /></div>
              <div><label className="label">N° tracking</label><input name="tracking_number" className="input" /></div>
              <div>
                <label className="label">Transporteur</label>
                <select name="carrier" className="input">{CARRIERS.map((c) => <option key={c} value={c}>{c || '—'}</option>)}</select>
              </div>
              <div><label className="label">Adhérent / client</label><input name="adherent" className="input" /></div>
              <div><label className="label">Destinataire</label><input name="destinataire" className="input" /></div>
              <div><label className="label">Pays</label><input name="pays" className="input" /></div>
              <div><label className="label">Date de l'incident</label><input type="date" name="date_incident" className="input" /></div>
              <div><label className="label">Date limite de réclamation</label><input type="date" name="deadline" className="input" /></div>
              <div><label className="label">Montant estimé (€)</label><input type="number" step="0.01" name="montant_estime" className="input" /></div>
              <div><label className="label">Montant réclamé (€)</label><input type="number" step="0.01" name="montant_reclame" className="input" /></div>
              <div><label className="label">Assureur</label><input name="assureur" className="input" placeholder="ex. AXA, TMS courtage…" /></div>
              <div>
                <label className="label">Priorité</label>
                <select name="priority" className="input" defaultValue="moyenne">
                  {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Responsable du dossier</label>
              <select name="assignee_id" className="input" defaultValue={profile?.id}>
                <option value="">—</option>
                {profiles.filter((p) => !p.disabled).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer le dossier</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={`${detail.ref} — ${detail.title}`} onClose={() => setDetailId(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUSES[detail.status].badge}`}>{STATUSES[detail.status].label}</span>
              <span className="text-xs text-aura-700/70">{KINDS[detail.kind]} · {CATEGORIES[detail.category]} · incident {formatDate(detail.date_incident)}</span>
              <select
                className="input !w-auto !py-1 text-xs ml-auto"
                value={detail.status}
                onChange={(e) => changeStatus(detail, e.target.value as ClaimStatus)}
              >
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            <div className="text-xs text-aura-700/80 rounded-lg bg-aura-50/70 p-3 space-y-0.5">
              {detail.shipping_ref && <div>Expédition <b>{detail.shipping_ref}</b>{detail.tracking_number && <> · tracking <b className="font-mono">{detail.tracking_number}</b></>}</div>}
              <div>{detail.carrier || 'Transporteur —'} · {detail.adherent || 'Adhérent —'} · {detail.destinataire || 'Destinataire —'} {detail.pays && `· ${detail.pays}`}</div>
              {detail.assureur && <div>Assureur : {detail.assureur}</div>}
            </div>

            <form onSubmit={saveDetail} className="grid grid-cols-2 gap-3">
              <div><label className="label">Montant estimé (€)</label><input type="number" step="0.01" name="montant_estime" className="input" defaultValue={detail.montant_estime || ''} /></div>
              <div><label className="label">Montant réclamé (€)</label><input type="number" step="0.01" name="montant_reclame" className="input" defaultValue={detail.montant_reclame || ''} /></div>
              <div><label className="label">Montant récupéré (€)</label><input type="number" step="0.01" name="montant_recupere" className="input" defaultValue={detail.montant_recupere || ''} /></div>
              <div><label className="label">Date limite réclamation</label><input type="date" name="deadline" className="input" defaultValue={detail.deadline ?? ''} /></div>
              <div>
                <label className="label">Priorité</label>
                <select name="priority" className="input" defaultValue={detail.priority}>
                  {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Responsable</label>
                <select name="assignee_id" className="input" defaultValue={detail.assignee_id ?? ''}>
                  <option value="">—</option>
                  {profiles.filter((p) => !p.disabled).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="label">Assureur</label><input name="assureur" className="input" defaultValue={detail.assureur} /></div>
              <div className="col-span-2"><label className="label">Description</label><textarea name="description" className="input" rows={3} defaultValue={detail.description} /></div>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="btn-primary !py-1.5 text-xs">Enregistrer les modifications</button>
              </div>
            </form>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wide text-aura-700/70">Historique & pièces</h4>
                <label className="btn-secondary !px-3 !py-1 text-xs cursor-pointer">
                  📎 Joindre une pièce
                  <input type="file" className="hidden" onChange={uploadDoc} />
                </label>
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-lg border border-aura-100 p-3">
                {detailEvents.length === 0 && <p className="text-xs text-aura-700/60">Aucun événement.</p>}
                {detailEvents.map((ev) => (
                  <div key={ev.id} className="text-xs border-b border-aura-100/60 pb-1.5 last:border-0">
                    <span className="text-aura-700/60">{formatDateTime(ev.created_at)} · {profileName(profiles, ev.author_id)}</span>
                    <div className={ev.kind === 'statut' ? 'text-aura-700 italic' : ''}>
                      {ev.file_url ? (
                        <a href={ev.file_url} target="_blank" rel="noreferrer" className="text-accent-500 underline">📎 {ev.file_name ?? 'Pièce jointe'}</a>
                      ) : (
                        ev.content
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={addComment} className="flex gap-2 mt-2">
                <input name="comment" className="input flex-1" placeholder="Ajouter un commentaire (appel transporteur, relance…)…" />
                <button type="submit" className="btn-primary !px-3 !py-1.5 text-xs">Ajouter</button>
              </form>
            </div>

            {profile?.role === 'admin' && (
              <button
                className="text-xs text-coral-600 underline"
                onClick={async () => {
                  if (!confirm(`Supprimer définitivement le dossier ${detail.ref} et son historique ?`)) return
                  await remove('claims', detail.id)
                  setDetailId(null)
                  refresh()
                }}
              >
                Supprimer ce dossier
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
