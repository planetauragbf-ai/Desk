import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { signalerErreur } from '../lib/erreurs'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../hooks/useTable'
import { insert, remove, update } from '../lib/data'
import { supabase } from '../lib/supabase'
import { notify } from '../lib/notify'
import { loadAdherents, mergeAdherentNames, type AdherentRef } from '../lib/adherents'
import { formatDate, formatDateTime, profileName } from '../lib/format'
import type { Claim, ClaimCategory, ClaimStatus, Priority, Profile } from '../lib/types'
import { Card, EmptyState, Modal, Skeleton, StatTile } from '../components/ui'

const CATEGORIES: Record<ClaimCategory, string> = {
  casse: '🍷 Casse',
  perte: '📦 Perte',
  vol: '🚨 Vol',
  retard: '⏰ Retard de livraison',
  temperature: '🌡 Température / vin altéré',
  erreur_livraison: '📍 Erreur de livraison',
  facturation: '🧾 Facturation',
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
const CARRIERS = ['', 'UPS', 'FedEx', 'DHL', 'TNT', 'GLS', 'Colissimo', 'Chronopost', 'DPD', 'Weship', 'Autre']
const CF_STATUTS = ['', 'À déclarer', 'Déclaré', 'En instruction', 'Accord reçu', 'Refusé', 'Clos']
const OPEN_STATUSES: ClaimStatus[] = ['nouveau', 'en_cours', 'attente_transporteur', 'attente_assurance', 'attente_client']

const eur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const daysOpen = (c: Claim) =>
  Math.max(0, Math.round(((c.closed_at ? new Date(c.closed_at).getTime() : Date.now()) - new Date(c.created_at).getTime()) / 86400000))

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

function Section({ title }: { title: string }) {
  return (
    <div className="sm:col-span-2 text-[10px] font-extrabold uppercase tracking-widest text-accent-500 border-b-2 border-accent-500/40 pb-1 mt-2">
      {title}
    </div>
  )
}

const F = ({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) => (
  <div className={full ? 'sm:col-span-2' : ''}>
    <label className="label">{label}</label>
    {children}
  </div>
)

/**
 * Formulaire commun (création et fiche) : toutes les sections du suivi PA.
 *
 * Défini au premier niveau du module, et NON à l'intérieur de ClaimPage :
 * une fonction recréée à chaque rendu est un nouveau type de composant pour
 * React, qui démontait puis remontait tout le formulaire. La saisie en cours
 * était perdue au moindre rendu — réception d'un message, rafraîchissement
 * temps réel, changement de filtre.
 */
function ClaimForm({ c, onSubmit, submitLabel, profiles, defaultAssignee }: {
  c: Partial<Claim>
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  submitLabel: string
  profiles: Profile[]
  defaultAssignee: string
}) {
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Section title="Identification" />
      <F label="Titre du dossier *" full>
        <input name="title" className="input" required defaultValue={c.title ?? ''} placeholder="ex. 6 btl cassées — commande 6060 UPS" />
      </F>
      <F label="Type">
        <select name="category" className="input" defaultValue={c.category ?? 'casse'}>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </F>
      <F label="Urgence">
        <select name="priority" className="input" defaultValue={c.priority ?? 'moyenne'}>
          {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </F>
      <F label="Responsable" full>
        <select name="assignee_id" className="input" defaultValue={c.assignee_id ?? defaultAssignee}>
          <option value="">—</option>
          {profiles.filter((p) => !p.disabled).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </F>

      <Section title="Client" />
      <F label="Nom client">
        <input name="client_nom" className="input" list="claim-clients" defaultValue={c.client_nom ?? ''} />
      </F>
      <F label="Pays">
        <input name="pays" className="input" list="claim-pays" defaultValue={c.pays ?? ''} />
      </F>
      <F label="Email">
        <input type="email" name="client_email" className="input" defaultValue={c.client_email ?? ''} />
      </F>
      <F label="Téléphone">
        <input name="client_tel" className="input" defaultValue={c.client_tel ?? ''} />
      </F>

      <Section title="Commande" />
      <F label="N° shipping PA">
        <input name="shipping_ref" className="input" defaultValue={c.shipping_ref ?? ''} placeholder="ex. 6060" />
      </F>
      <F label="Adhérent">
        <input name="adherent" className="input" list="claim-adherents" defaultValue={c.adherent ?? ''} />
      </F>
      <F label="Date expédition">
        <input type="date" name="date_expedition" className="input" defaultValue={c.date_expedition ?? ''} />
      </F>
      <F label="Date livraison">
        <input type="date" name="date_livraison" className="input" defaultValue={c.date_livraison ?? ''} />
      </F>
      <F label="Valeur commande (€)">
        <input type="number" step="0.01" name="valeur_commande" className="input" defaultValue={c.valeur_commande || ''} />
      </F>

      <Section title="Transport" />
      <F label="Transporteur">
        <select name="carrier" className="input" defaultValue={c.carrier ?? ''}>
          {CARRIERS.map((t) => <option key={t} value={t}>{t || '—'}</option>)}
        </select>
      </F>
      <F label="N° tracking">
        <input name="tracking_number" className="input" defaultValue={c.tracking_number ?? ''} />
      </F>
      <F label="Lien suivi">
        <input name="lien_suivi" className="input" defaultValue={c.lien_suivi ?? ''} placeholder="https://…" />
      </F>
      <F label="Lien transporteur">
        <input name="lien_transporteur" className="input" defaultValue={c.lien_transporteur ?? ''} placeholder="https://…" />
      </F>

      <Section title="Sinistre" />
      <F label="Date constat">
        <input type="date" name="date_incident" className="input" defaultValue={c.date_incident ?? ''} />
      </F>
      <F label="Nb btl. concernées">
        <input type="number" name="nb_bouteilles" className="input" defaultValue={c.nb_bouteilles || ''} />
      </F>
      <F label="Préjudice estimé (€)">
        <input type="number" step="0.01" name="montant_estime" className="input" defaultValue={c.montant_estime || ''} />
      </F>
      <F label="Lien dossier drive">
        <input name="lien_drive" className="input" defaultValue={c.lien_drive ?? ''} placeholder="https://drive.google.com/…" />
      </F>
      <F label="Description" full>
        <textarea name="description" className="input" rows={2} defaultValue={c.description ?? ''} placeholder="Circonstances, constat…" />
      </F>

      <Section title="Réserves & recours transporteur" />
      <F label="Réserves émises">
        <input name="reserves" className="input" defaultValue={c.reserves ?? ''} placeholder="ex. Oui — mention CMR" />
      </F>
      <F label="Date limite réclamation">
        <input type="date" name="deadline" className="input" defaultValue={c.deadline ?? ''} />
      </F>
      <F label="LRAR envoyée le">
        <input type="date" name="lrar_le" className="input" defaultValue={c.lrar_le ?? ''} />
      </F>
      <F label="AR reçu le">
        <input type="date" name="ar_le" className="input" defaultValue={c.ar_le ?? ''} />
      </F>
      <F label="Réponse transporteur" full>
        <input name="reponse_transporteur" className="input" defaultValue={c.reponse_transporteur ?? ''} />
      </F>

      <Section title="Coste Fermon (assureur)" />
      <F label="Assureur">
        <input name="assureur" className="input" defaultValue={c.assureur ?? 'Coste Fermon'} />
      </F>
      <F label="Statut CF">
        <select name="cf_statut" className="input" defaultValue={c.cf_statut ?? ''}>
          {CF_STATUTS.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
        </select>
      </F>
      <F label="Date déclaration CF">
        <input type="date" name="cf_declaration" className="input" defaultValue={c.cf_declaration ?? ''} />
      </F>
      <F label="N° dossier CF">
        <input name="cf_dossier" className="input" defaultValue={c.cf_dossier ?? ''} />
      </F>
      <F label="Interlocuteur CF">
        <input name="cf_interlocuteur" className="input" defaultValue={c.cf_interlocuteur ?? ''} />
      </F>
      <F label="Dernière relance CF">
        <input type="date" name="cf_relance" className="input" defaultValue={c.cf_relance ?? ''} />
      </F>

      <Section title="Indemnisation" />
      <F label="Montant proposé (€)">
        <input type="number" step="0.01" name="montant_propose" className="input" defaultValue={c.montant_propose || ''} />
      </F>
      <F label="Date accord">
        <input type="date" name="date_accord" className="input" defaultValue={c.date_accord ?? ''} />
      </F>
      <F label="Montant versé (€)">
        <input type="number" step="0.01" name="montant_recupere" className="input" defaultValue={c.montant_recupere || ''} />
      </F>
      <F label="Date versement">
        <input type="date" name="date_versement" className="input" defaultValue={c.date_versement ?? ''} />
      </F>
      <div className="sm:col-span-2 text-xs text-aura-700/80">
        Reste à charge PA : <b>{eur((c.montant_estime || 0) - (c.montant_recupere || 0))}</b> (préjudice − versé, recalculé après enregistrement)
      </div>

      <Section title="Prochaine action" />
      <F label="Prochaine action">
        <input name="prochaine_action" className="input" defaultValue={c.prochaine_action ?? ''} placeholder="ex. Relancer CF, envoyer LRAR…" />
      </F>
      <F label="Échéance">
        <input type="date" name="action_echeance" className="input" defaultValue={c.action_echeance ?? ''} />
      </F>
      <F label="Notes" full>
        <textarea name="notes" className="input" rows={2} defaultValue={c.notes ?? ''} />
      </F>

      <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
        <button type="submit" className="btn-primary">{submitLabel}</button>
      </div>
    </form>
  )
}

export default function ClaimPage() {
  const { profile } = useAuth()
  const [showNew, setShowNew] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [carrierFilter, setCarrierFilter] = useState('')
  const [paysFilter, setPaysFilter] = useState('')
  const [adherentFilter, setAdherentFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const { rows: claims, refresh, loading } = useTable('claims', undefined, { column: 'created_at', ascending: false })
  const { rows: events, refresh: refreshEvents } = useTable('claim_events', undefined, { column: 'created_at', ascending: true })
  const { rows: profiles } = useTable('profiles', undefined, { column: 'full_name', ascending: true })

  const detail = claims.find((c) => c.id === detailId) ?? null

  // Listes auto-apprenantes : une valeur saisie une fois devient proposée.
  const distinct = (get: (c: Claim) => string | undefined) =>
    [...new Set(claims.map(get).filter((v): v is string => !!v && v.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'fr'))
  // Référentiel adhérents : Planet'Stock (source unique) + valeurs déjà
  // saisies dans les dossiers, pour ne rien perdre de l'historique.
  const [referentiel, setReferentiel] = useState<AdherentRef[]>([])
  useEffect(() => {
    loadAdherents().then(setReferentiel)
  }, [])
  const adherents = useMemo(
    () => mergeAdherentNames(referentiel, claims.map((c) => c.adherent)),
    [referentiel, claims],
  )
  const paysList = useMemo(() => distinct((c) => c.pays), [claims])
  const clientsList = useMemo(() => distinct((c) => c.client_nom), [claims])

  // ---- Statistiques
  const open = claims.filter((c) => OPEN_STATUSES.includes(c.status))
  const waiting = claims.filter((c) => c.status.startsWith('attente'))
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const urgent = open.filter((c) => (c.deadline && c.deadline <= soon) || (c.action_echeance && c.action_echeance <= soon))
  const totalPrejudice = claims.reduce((s, c) => s + (c.montant_estime || 0), 0)
  const totalVerse = claims.reduce((s, c) => s + (c.montant_recupere || 0), 0)
  const taux = totalPrejudice ? Math.round((totalVerse / totalPrejudice) * 100) : 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return claims.filter(
      (c) =>
        (!statusFilter || c.status === statusFilter) &&
        (!carrierFilter || c.carrier === carrierFilter) &&
        (!paysFilter || c.pays === paysFilter) &&
        (!adherentFilter || c.adherent === adherentFilter) &&
        (!categoryFilter || c.category === categoryFilter) &&
        (!assigneeFilter || c.assignee_id === assigneeFilter) &&
        (!q ||
          [c.ref, c.title, c.description, c.shipping_ref, c.tracking_number, c.adherent, c.client_nom, c.destinataire, c.pays, c.cf_dossier, c.prochaine_action]
            .some((s) => (s ?? '').toLowerCase().includes(q))),
    )
  }, [claims, search, statusFilter, carrierFilter, paysFilter, adherentFilter, categoryFilter, assigneeFilter])

  /** Responsables présents dans au moins un dossier. */
  const assignees = useMemo(() => {
    const ids = new Set(claims.map((c) => c.assignee_id).filter(Boolean))
    return profiles.filter((p) => ids.has(p.id))
  }, [claims, profiles])

  const nextRef = () => {
    const year = new Date().getFullYear()
    const n = claims.filter((c) => c.ref.includes(String(year))).length + 1
    return `PA-${year}-${String(n).padStart(3, '0')}`
  }

  async function addEvent(claimId: string, kind: 'commentaire' | 'statut' | 'document', content: string, file?: { url: string; name: string }) {
    try {
      await insert('claim_events', {
        claim_id: claimId,
        author_id: profile?.id ?? null,
        kind,
        content,
        file_url: file?.url ?? null,
        file_name: file?.name ?? null,
      })
      refreshEvents()
    } catch (err) {
      signalerErreur(err, 'Ajout au suivi')
    }
  }

  const fdStr = (fd: FormData, k: string) => String(fd.get(k) ?? '')
  const fdNum = (fd: FormData, k: string) => Number(fd.get(k) || 0)
  const fdDate = (fd: FormData, k: string) => String(fd.get(k) || '') || null

  function collectFields(fd: FormData) {
    return {
      category: fdStr(fd, 'category') as ClaimCategory,
      priority: fdStr(fd, 'priority') as Priority,
      title: fdStr(fd, 'title'),
      description: fdStr(fd, 'description'),
      client_nom: fdStr(fd, 'client_nom'),
      client_email: fdStr(fd, 'client_email'),
      client_tel: fdStr(fd, 'client_tel'),
      pays: fdStr(fd, 'pays'),
      shipping_ref: fdStr(fd, 'shipping_ref'),
      adherent: fdStr(fd, 'adherent'),
      date_expedition: fdDate(fd, 'date_expedition'),
      date_livraison: fdDate(fd, 'date_livraison'),
      valeur_commande: fdNum(fd, 'valeur_commande'),
      carrier: fdStr(fd, 'carrier'),
      tracking_number: fdStr(fd, 'tracking_number'),
      lien_suivi: fdStr(fd, 'lien_suivi'),
      lien_transporteur: fdStr(fd, 'lien_transporteur'),
      date_incident: fdDate(fd, 'date_incident'),
      nb_bouteilles: fdNum(fd, 'nb_bouteilles'),
      montant_estime: fdNum(fd, 'montant_estime'),
      lien_drive: fdStr(fd, 'lien_drive'),
      reserves: fdStr(fd, 'reserves'),
      lrar_le: fdDate(fd, 'lrar_le'),
      ar_le: fdDate(fd, 'ar_le'),
      reponse_transporteur: fdStr(fd, 'reponse_transporteur'),
      deadline: fdDate(fd, 'deadline'),
      assureur: fdStr(fd, 'assureur') || 'Coste Fermon',
      cf_declaration: fdDate(fd, 'cf_declaration'),
      cf_dossier: fdStr(fd, 'cf_dossier'),
      cf_interlocuteur: fdStr(fd, 'cf_interlocuteur'),
      cf_statut: fdStr(fd, 'cf_statut'),
      cf_relance: fdDate(fd, 'cf_relance'),
      montant_propose: fdNum(fd, 'montant_propose'),
      date_accord: fdDate(fd, 'date_accord'),
      montant_recupere: fdNum(fd, 'montant_recupere'),
      date_versement: fdDate(fd, 'date_versement'),
      prochaine_action: fdStr(fd, 'prochaine_action'),
      action_echeance: fdDate(fd, 'action_echeance'),
      notes: fdStr(fd, 'notes'),
      assignee_id: fdStr(fd, 'assignee_id') || null,
    }
  }

  async function createClaim(e: FormEvent<HTMLFormElement>) {
    try {
      e.preventDefault()
      const fields = collectFields(new FormData(e.currentTarget))
      const created = await insert('claims', {
        ...fields,
        ref: nextRef(),
        kind: 'sinistre',
        status: 'nouveau',
        created_by: profile?.id ?? null,
      })
      await addEvent(created.id, 'statut', 'Dossier ouvert')
      if (fields.assignee_id && fields.assignee_id !== profile?.id) {
        await notify(fields.assignee_id, `🛡 Dossier ${created.ref} « ${created.title} » vous a été attribué`, '/claim')
      }
      setShowNew(false)
      refresh()
      setDetailId(created.id)
    } catch (err) {
      signalerErreur(err, 'Création du dossier')
    }
  }

  async function saveDetail(e: FormEvent<HTMLFormElement>) {
    try {
      e.preventDefault()
      if (!detail) return
      await update('claims', detail.id, collectFields(new FormData(e.currentTarget)))
      refresh()
    } catch (err) {
      signalerErreur(err, 'Enregistrement du dossier')
    }
  }

  async function changeStatus(c: Claim, status: ClaimStatus) {
    try {
      const closed = status === 'clos' || status === 'accepte' || status === 'refuse'
      await update('claims', c.id, { status, closed_at: closed ? new Date().toISOString() : null })
      await addEvent(c.id, 'statut', `Statut : ${STATUSES[c.status].label} → ${STATUSES[status].label}`)
      if (c.assignee_id && c.assignee_id !== profile?.id) {
        await notify(c.assignee_id, `🛡 ${c.ref} : ${STATUSES[status].label}`, '/claim')
      }
      refresh()
    } catch (err) {
      signalerErreur(err, 'Changement de statut')
    }
  }

  async function uploadDocs(e: ChangeEvent<HTMLInputElement>) {
    try {
      const files = [...(e.target.files ?? [])]
      e.target.value = ''
      if (!files.length || !detail) return
      for (const file of files) {
        try {
          const up = await uploadClaimFile(file)
          await addEvent(detail.id, 'document', up.name, up)
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err))
          break
        }
      }
    } catch (err) {
      signalerErreur(err, 'Envoi des documents')
    }
  }

  async function addComment(e: FormEvent<HTMLFormElement>) {
    try {
      e.preventDefault()
      if (!detail) return
      const fd = new FormData(e.currentTarget)
      const content = String(fd.get('comment')).trim()
      if (!content) return
      e.currentTarget.reset()
      await addEvent(detail.id, 'commentaire', content)
    } catch (err) {
      signalerErreur(err, 'Ajout du commentaire')
    }
  }

  function exportCsv() {
    const cols = ['ref', 'created_at', 'status', 'priority', 'client_nom', 'client_email', 'client_tel', 'pays', 'shipping_ref', 'adherent', 'date_expedition', 'date_livraison', 'valeur_commande', 'carrier', 'tracking_number', 'lien_suivi', 'lien_transporteur', 'category', 'date_incident', 'nb_bouteilles', 'montant_estime', 'description', 'lien_drive', 'reserves', 'lrar_le', 'ar_le', 'reponse_transporteur', 'cf_declaration', 'cf_dossier', 'cf_interlocuteur', 'cf_statut', 'cf_relance', 'montant_propose', 'date_accord', 'montant_recupere', 'date_versement', 'prochaine_action', 'action_echeance', 'notes'] as const
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = filtered.map((c) => cols.map((k) => esc((c as unknown as Record<string, unknown>)[k])).join(';'))
    const csv = [cols.join(';'), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `planet-claim-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const detailEvents = events.filter((ev) => ev.claim_id === detailId)
  const detailDocs = detailEvents.filter((ev) => ev.kind === 'document' && ev.file_url)

  return (
    <div className="space-y-5">
      {/* Listes auto-apprenantes partagées par les formulaires */}
      <datalist id="claim-adherents">{adherents.map((a) => <option key={a} value={a} />)}</datalist>
      <datalist id="claim-pays">{paysList.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="claim-clients">{clientsList.map((p) => <option key={p} value={p} />)}</datalist>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Sinistres</h1>
          <p className="text-sm text-aura-700/80 mt-1">Déclaration, réserves et recours transporteur, dossier Coste Fermon, indemnisation.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv}>⇩ Export CSV</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouveau dossier</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Dossiers ouverts" value={open.length} />
        <StatTile label="En attente de tiers" value={waiting.length} />
        <StatTile label="Échéance < 7 j" value={urgent.length} tone={urgent.length ? 'alert' : 'default'} />
        <StatTile label="Préjudice cumulé" value={eur(totalPrejudice)} />
        <StatTile label="Montant versé" value={eur(totalVerse)} tone={totalVerse ? 'ok' : 'default'} />
        <StatTile label="Taux d'indemnisation" value={`${taux} %`} tone={taux >= 50 ? 'ok' : 'default'} />
      </div>

      {urgent.length > 0 && (
        <Card title={<span className="text-coral-600">⏳ Échéances proches (réclamation ou prochaine action)</span>}>
          <ul className="space-y-1.5">
            {urgent.map((c) => (
              <li key={c.id} className="text-sm flex flex-wrap items-center gap-2">
                <button className="font-semibold underline" onClick={() => setDetailId(c.id)}>{c.ref}</button>
                <span className="flex-1 truncate">{c.title}{c.prochaine_action && ` — ${c.prochaine_action}`}</span>
                <span className="text-coral-600 font-semibold whitespace-nowrap">
                  {formatDate([c.deadline, c.action_echeance].filter(Boolean).sort()[0])}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <input className="input max-w-56" placeholder="Rechercher (réf, client, tracking…)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input max-w-52" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input max-w-48" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Tous les types</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input max-w-44" value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}>
            <option value="">Tous transporteurs</option>
            {CARRIERS.filter(Boolean).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input max-w-40" value={paysFilter} onChange={(e) => setPaysFilter(e.target.value)}>
            <option value="">Tous les pays</option>
            {paysList.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="input max-w-44" value={adherentFilter} onChange={(e) => setAdherentFilter(e.target.value)}>
            <option value="">Tous les adhérents</option>
            {adherents.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select className="input max-w-44" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">Tous les responsables</option>
            {assignees.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          {(statusFilter || categoryFilter || carrierFilter || paysFilter || adherentFilter || assigneeFilter || search) && (
            <button
              className="text-xs text-aura-700 underline"
              onClick={() => { setSearch(''); setStatusFilter(''); setCategoryFilter(''); setCarrierFilter(''); setPaysFilter(''); setAdherentFilter(''); setAssigneeFilter('') }}
            >
              Réinitialiser
            </button>
          )}
        </div>

        {loading ? (
          <Skeleton lines={5} />
        ) : filtered.length === 0 ? (
          <EmptyState>Aucun dossier. Déclarez le premier sinistre avec « + Nouveau dossier ».</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr>
                  <th className="table-head rounded-l-lg">N° dossier</th>
                  <th className="table-head">Dossier / client</th>
                  <th className="table-head">Type</th>
                  <th className="table-head">Transporteur</th>
                  <th className="table-head">Statut</th>
                  <th className="table-head text-right">Jours</th>
                  <th className="table-head text-right">Préjudice</th>
                  <th className="table-head text-right">Versé</th>
                  <th className="table-head">Prochaine action</th>
                  <th className="table-head rounded-r-lg">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-aura-50/60 cursor-pointer" onClick={() => setDetailId(c.id)}>
                    <td className="table-cell font-mono text-xs font-bold whitespace-nowrap">{c.ref}</td>
                    <td className="table-cell">
                      <div className="font-semibold text-sm">{c.title}</div>
                      <div className="text-[11px] text-aura-700/60">
                        {[c.client_nom, c.adherent && `Adh. ${c.adherent}`, c.pays].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="table-cell text-xs whitespace-nowrap">{CATEGORIES[c.category]}</td>
                    <td className="table-cell text-xs">{c.carrier || '—'}</td>
                    <td className="table-cell">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUSES[c.status].badge}`}>
                        {STATUSES[c.status].label}
                      </span>
                    </td>
                    <td className="table-cell text-right text-xs">{daysOpen(c)} j</td>
                    <td className="table-cell text-right text-xs font-semibold">{c.montant_estime ? eur(c.montant_estime) : '—'}</td>
                    <td className="table-cell text-right text-xs font-semibold text-emerald-700">{c.montant_recupere ? eur(c.montant_recupere) : '—'}</td>
                    <td className={`table-cell text-xs max-w-44 truncate ${c.action_echeance && c.action_echeance <= soon && OPEN_STATUSES.includes(c.status) ? 'text-coral-600 font-bold' : ''}`}>
                      {c.prochaine_action || '—'}{c.action_echeance && ` (${formatDate(c.action_echeance)})`}
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
        <Modal wide title={`Nouveau dossier — ${nextRef()}`} onClose={() => setShowNew(false)}>
          <ClaimForm c={{ assureur: 'Coste Fermon' }} onSubmit={createClaim} submitLabel="Créer le dossier" profiles={profiles} defaultAssignee={profile?.id ?? ''} />
        </Modal>
      )}

      {detail && (
        <Modal wide title={`${detail.ref} — ${detail.title}`} onClose={() => setDetailId(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUSES[detail.status].badge}`}>{STATUSES[detail.status].label}</span>
              <span className="text-xs text-aura-700/70">
                Ouvert le {formatDate(detail.created_at)} · {daysOpen(detail)} jours · reste à charge <b>{eur((detail.montant_estime || 0) - (detail.montant_recupere || 0))}</b>
              </span>
              {detail.lien_suivi && <a href={detail.lien_suivi} target="_blank" rel="noreferrer" className="text-xs text-accent-500 underline">Suivi colis ↗</a>}
              {detail.lien_drive && <a href={detail.lien_drive} target="_blank" rel="noreferrer" className="text-xs text-accent-500 underline">Dossier drive ↗</a>}
              <select
                className="input !w-auto !py-1 text-xs ml-auto"
                value={detail.status}
                onChange={(e) => changeStatus(detail, e.target.value as ClaimStatus)}
              >
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wide text-aura-700/70">📁 Documents du dossier ({detailDocs.length})</h4>
                <label className="btn-secondary !px-3 !py-1 text-xs cursor-pointer">
                  📎 Ajouter des documents
                  <input type="file" multiple className="hidden" onChange={uploadDocs} />
                </label>
              </div>
              {detailDocs.length === 0 ? (
                <p className="text-xs text-aura-700/60">Aucun document. Photos de casse, PV de réserve, factures, LRAR, échanges CF… (plusieurs fichiers à la fois possibles)</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {detailDocs.map((doc) => (
                    <div key={doc.id} className="group relative rounded-lg border border-aura-100 p-2 text-xs">
                      <a href={doc.file_url!} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-aura-900 hover:text-accent-500">
                        <span>📄</span>
                        <span className="truncate underline">{doc.file_name}</span>
                      </a>
                      <div className="text-[10px] text-aura-700/60 mt-0.5">{formatDate(doc.created_at)} · {profileName(profiles, doc.author_id)}</div>
                      <button
                        className="absolute top-1 right-1 hidden group-hover:block text-coral-600 text-[11px]"
                        onClick={async () => { if (confirm('Supprimer ce document ?')) { await remove('claim_events', doc.id); refreshEvents() } }}
                      >🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ClaimForm c={detail} onSubmit={saveDetail} submitLabel="Enregistrer les modifications" profiles={profiles} defaultAssignee={profile?.id ?? ''} />

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-aura-700/70 mb-2">Historique</h4>
              <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-lg border border-aura-100 p-3">
                {detailEvents.filter((ev) => ev.kind !== 'document').length === 0 && <p className="text-xs text-aura-700/60">Aucun événement.</p>}
                {detailEvents.filter((ev) => ev.kind !== 'document').map((ev) => (
                  <div key={ev.id} className="text-xs border-b border-aura-100/60 pb-1.5 last:border-0">
                    <span className="text-aura-700/60">{formatDateTime(ev.created_at)} · {profileName(profiles, ev.author_id)}</span>
                    <div className={ev.kind === 'statut' ? 'text-aura-700 italic' : ''}>{ev.content}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={addComment} className="flex gap-2 mt-2">
                <input name="comment" className="input flex-1" placeholder="Ajouter un commentaire (appel transporteur, relance CF…)…" />
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
