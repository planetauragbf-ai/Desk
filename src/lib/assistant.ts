// Assistant Aura : moteur local de recherche et de réponse.
// Il indexe toutes les données de l'espace (objectifs, tâches, notes,
// documents, décisions, workflows, liens, messages, équipe) et répond
// aux questions par détection d'intention + recherche plein texte,
// sans dépendre d'un service externe.
import type {
  Channel,
  Claim,
  Decision,
  DocumentMeta,
  Leave,
  LinkItem,
  Message,
  Note,
  Objective,
  Profile,
  Task,
  WorkflowTemplate,
} from './types'
import { OBJECTIVE_STATUS_LABELS, TASK_STATUS_LABELS, formatDate, isPast } from './format'

export interface AssistantData {
  profile: Profile | null
  profiles: Profile[]
  objectives: Objective[]
  tasks: Task[]
  notes: Note[]
  documents: DocumentMeta[]
  decisions: Decision[]
  workflows: WorkflowTemplate[]
  links: LinkItem[]
  channels: Channel[]
  messages: Message[]
  leaves: Leave[]
  claims: Claim[]
  /** Expéditions Planet'Dash (état applicatif, hors couche typée) */
  shippings: DashShipping[]
}

/** Expédition telle que stockée par Planet'Dash */
export interface DashShipping {
  id: string
  dashboard?: string
  status?: string
  transporteur?: string
  dateLivSouhaitee?: string
  tracking?: { number?: string }
  exp?: { nom?: string }
  dest?: { nom?: string; prenom?: string; ville?: string; pays?: string }
}

export interface AssistantResult {
  kind: 'objectif' | 'tache' | 'note' | 'document' | 'decision' | 'process' | 'lien' | 'personne' | 'message' | 'conge' | 'expedition' | 'sinistre'
  title: string
  subtitle?: string
  /** Route interne (commence par « / ») ou URL externe (liens outils) */
  to?: string
  external?: boolean
}

export interface AssistantAnswer {
  text: string
  results: AssistantResult[]
}

/** Raccourcis proposés dans l'interface de l'assistant. */
export const SHORTCUTS = [
  'Mes tâches',
  'Tâches en retard',
  'Échéances à venir',
  'Documents récents',
  'Nos outils',
  'Nos process',
  'Objectifs en cours',
  'Qui est absent ?',
  'Expéditions en incident',
  'Dossiers sinistres ouverts',
]

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
}

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux', 'et', 'ou', 'en',
  'sur', 'pour', 'par', 'avec', 'dans', 'est', 'sont', 'je', 'tu', 'il', 'elle',
  'nous', 'vous', 'ils', 'elles', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son',
  'sa', 'ses', 'nos', 'vos', 'leur', 'leurs', 'ce', 'cet', 'cette', 'ces', 'qui',
  'que', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'comment', 'combien',
  'trouve', 'cherche', 'montre', 'donne', 'moi', 'me', 'peux', 'veux', 'voir',
])

interface Doc {
  result: AssistantResult
  haystackTitle: string
  haystackBody: string
  date: string
}

function buildIndex(d: AssistantData): Doc[] {
  const name = (id: string | null) => d.profiles.find((p) => p.id === id)?.full_name ?? ''
  const docs: Doc[] = []

  for (const o of d.objectives) {
    docs.push({
      result: {
        kind: 'objectif',
        title: o.title,
        subtitle: `${OBJECTIVE_STATUS_LABELS[o.status]} · échéance ${formatDate(o.due_date)}`,
        to: `/objectifs/${o.id}`,
      },
      haystackTitle: o.title,
      haystackBody: `${o.expected_result} ${name(o.owner_id)}`,
      date: o.created_at,
    })
  }
  for (const t of d.tasks) {
    const objective = d.objectives.find((o) => o.id === t.objective_id)
    docs.push({
      result: {
        kind: 'tache',
        title: t.title,
        subtitle: `${TASK_STATUS_LABELS[t.status]} · ${t.assigned_kind === 'client' ? t.external_name ?? 'client' : name(t.assignee_id) || 'non attribuée'} · échéance ${formatDate(t.due_date)}`,
        to: t.objective_id ? `/objectifs/${t.objective_id}` : '/pilotage',
      },
      haystackTitle: t.title,
      haystackBody: `${t.description} ${objective?.title ?? ''} ${name(t.assignee_id)} ${t.external_name ?? ''}`,
      date: t.created_at,
    })
  }
  for (const n of d.notes) {
    docs.push({
      result: { kind: 'note', title: n.title, subtitle: n.content.slice(0, 90), to: '/notes' },
      haystackTitle: n.title,
      haystackBody: `${n.content} ${name(n.author_id)}`,
      date: n.updated_at,
    })
  }
  for (const doc of d.documents) {
    docs.push({
      result: {
        kind: 'document',
        title: doc.name,
        subtitle: `Dossier ${doc.folder} · déposé le ${formatDate(doc.created_at)} par ${name(doc.author_id) || '—'}`,
        to: '/documents',
      },
      haystackTitle: doc.name,
      haystackBody: `${doc.folder} ${name(doc.author_id)}`,
      date: doc.created_at,
    })
  }
  for (const dec of d.decisions) {
    docs.push({
      result: { kind: 'decision', title: dec.title, subtitle: dec.outcome || dec.context, to: dec.objective_id ? `/objectifs/${dec.objective_id}` : '/pilotage' },
      haystackTitle: dec.title,
      haystackBody: `${dec.context} ${dec.outcome}`,
      date: dec.created_at,
    })
  }
  for (const w of d.workflows) {
    docs.push({
      result: { kind: 'process', title: w.name, subtitle: w.description.slice(0, 90), to: '/workflows' },
      haystackTitle: w.name,
      haystackBody: w.description,
      date: w.updated_at,
    })
  }
  for (const l of d.links) {
    docs.push({
      result: { kind: 'lien', title: `${l.emoji} ${l.label}`, subtitle: l.description || l.url, to: l.url, external: true },
      haystackTitle: `${l.label} ${l.category}`,
      haystackBody: `${l.description} ${l.url}`,
      date: l.created_at,
    })
  }
  for (const p of d.profiles) {
    docs.push({
      result: { kind: 'personne', title: p.full_name, subtitle: `${p.role === 'admin' ? 'Administrateur' : p.role === 'referent' ? 'Référent' : 'Membre'} · ${p.email}`, },
      haystackTitle: p.full_name,
      haystackBody: `${p.email} ${p.role}`,
      date: p.created_at,
    })
  }
  for (const m of d.messages) {
    const channel = d.channels.find((c) => c.id === m.channel_id)
    // Les conversations privées et les messages directs restent hors index :
    // seuls leurs membres doivent pouvoir en retrouver le contenu.
    if (!channel || channel.private || channel.dm) continue
    docs.push({
      result: {
        kind: 'message',
        title: m.content.slice(0, 80),
        subtitle: `${name(m.author_id) || '—'} dans #${channel?.name ?? '?'} · ${formatDate(m.created_at)}`,
        to: `/chat?canal=${m.channel_id}`,
      },
      haystackTitle: '',
      haystackBody: `${m.content} ${name(m.author_id)} ${channel?.name ?? ''}`,
      date: m.created_at,
    })
  }
  const LEAVE_LABELS: Record<string, string> = {
    conge: 'Congé', maladie: 'Maladie', ecole: 'École', formation: 'Formation',
    teletravail: 'Télétravail', recup: 'Récup', absence: 'Absence', retard: 'Retard',
  }
  for (const l of d.leaves) {
    if (l.status === 'refusee') continue
    docs.push({
      result: {
        kind: 'conge',
        title: `${name(l.profile_id) || '—'} — ${LEAVE_LABELS[l.type] ?? l.type}`,
        subtitle: `Du ${formatDate(l.start_date)} au ${formatDate(l.end_date)} · ${l.status === 'validee' ? 'validé' : 'en attente de validation'}`,
        to: '/calendrier',
      },
      haystackTitle: `${name(l.profile_id)} ${LEAVE_LABELS[l.type] ?? l.type}`,
      // Le motif n'est jamais indexé : il peut relever du secret médical.
      haystackBody: `conge absence ${l.start_date}`,
      date: l.created_at,
    })
  }
  const DASH_STATUS: Record<string, string> = {
    non_specifie: 'Non spécifié', att_info: 'Attente info', differe: 'Différé', pickup: 'Pick-up',
    transit: 'En transit', tentative: 'Tentative', point_relais: 'Point relais', exception: 'Exception',
    livre: 'Livré', sinistre: 'Sinistre', annule: 'Annulé',
  }
  for (const sh of d.shippings) {
    const dest = [sh.dest?.prenom, sh.dest?.nom].filter(Boolean).join(' ')
    docs.push({
      result: {
        kind: 'expedition',
        title: `Expédition ${sh.id}${dest ? ` — ${dest}` : ''}`,
        subtitle: `${DASH_STATUS[sh.status ?? ''] ?? sh.status ?? '—'}${sh.transporteur ? ` · ${sh.transporteur}` : ''}${sh.dest?.pays ? ` · ${sh.dest.pays}` : ''}${sh.tracking?.number ? ` · ${sh.tracking.number}` : ''}`,
        to: '/dash',
      },
      haystackTitle: `${sh.id} ${dest}`,
      haystackBody: `${sh.tracking?.number ?? ''} ${sh.transporteur ?? ''} ${sh.exp?.nom ?? ''} ${sh.dest?.ville ?? ''} ${sh.dest?.pays ?? ''} expedition colis`,
      date: sh.dateLivSouhaitee ?? '',
    })
  }
  for (const c of d.claims) {
    docs.push({
      result: {
        kind: 'sinistre',
        title: `${c.ref} — ${c.title}`,
        subtitle: `${c.status} · ${c.carrier || '—'}${c.adherent ? ` · ${c.adherent}` : ''}`,
        to: '/claim',
      },
      haystackTitle: `${c.ref} ${c.title}`,
      haystackBody: `${c.description} ${c.client_nom ?? ''} ${c.adherent} ${c.pays} ${c.shipping_ref} ${c.tracking_number} sinistre litige`,
      date: c.created_at,
    })
  }
  return docs
}

function search(d: AssistantData, query: string, kinds?: AssistantResult['kind'][]): AssistantResult[] {
  const tokens = tokenize(query).filter((t) => !STOP_WORDS.has(t))
  const docs = buildIndex(d).filter((doc) => !kinds || kinds.includes(doc.result.kind))
  if (tokens.length === 0) {
    return docs
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 8)
      .map((doc) => doc.result)
  }
  const scored = docs
    .map((doc) => {
      const title = normalize(doc.haystackTitle)
      const body = normalize(doc.haystackBody)
      let score = 0
      for (const t of tokens) {
        if (title.includes(t)) score += 3
        if (body.includes(t)) score += 1
      }
      return { doc, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.doc.date < b.doc.date ? 1 : -1))
  return scored.slice(0, 8).map((s) => s.doc.result)
}

function taskResult(d: AssistantData, t: Task): AssistantResult {
  const name = d.profiles.find((p) => p.id === t.assignee_id)?.full_name
  return {
    kind: 'tache',
    title: t.title,
    subtitle: `${TASK_STATUS_LABELS[t.status]} · ${t.assigned_kind === 'client' ? t.external_name ?? 'client' : name ?? 'non attribuée'} · échéance ${formatDate(t.due_date)}`,
    to: t.objective_id ? `/objectifs/${t.objective_id}` : '/pilotage',
  }
}

const plural = (n: number, s: string, p?: string) => (n > 1 ? p ?? `${s}s` : s)

/** Répond à une question ou un raccourci de l'utilisateur. */
export function answer(question: string, d: AssistantData): AssistantAnswer {
  const q = normalize(question)
  const open = (t: Task) => t.status !== 'termine'

  // ----- Aide / salutations
  if (/^(bonjour|salut|hello|coucou|aide|help)\b/.test(q) || /que (peux|sais)/.test(q)) {
    return {
      text:
        "Bonjour ! Je suis l'assistant Aura 🌍. Je cherche dans tout l'espace Planet Aura : objectifs, tâches, notes, documents, décisions, process, liens, messages du chat et équipe.\n" +
        "Essayez par exemple : « tâches en retard », « où est le cahier des charges ? », « qui s'occupe du site web ? », « nos outils », ou utilisez les raccourcis ci-dessous.",
      results: [],
    }
  }

  // ----- Tâches en retard
  if (q.includes('retard')) {
    const late = d.tasks.filter((t) => open(t) && isPast(t.due_date))
    return {
      text: late.length
        ? `${late.length} ${plural(late.length, 'tâche')} en retard :`
        : 'Bonne nouvelle : aucune tâche en retard 🎉',
      results: late.slice(0, 10).map((t) => taskResult(d, t)),
    }
  }

  // ----- Mes tâches
  if (/\b(mes|ma|mon)\b.*tach/.test(q) || q.trim() === 'mes taches') {
    const mine = d.tasks.filter((t) => open(t) && t.assignee_id === d.profile?.id)
    return {
      text: mine.length
        ? `Vous avez ${mine.length} ${plural(mine.length, 'tâche')} en cours ou à faire :`
        : "Vous n'avez aucune tâche ouverte pour le moment.",
      results: mine.slice(0, 10).map((t) => taskResult(d, t)),
    }
  }

  // ----- Échéances à venir
  if (q.includes('echeance') || q.includes('venir') || q.includes('semaine') || q.includes('deadline')) {
    const today = new Date().toISOString().slice(0, 10)
    const horizon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    const soon = d.tasks
      .filter((t) => open(t) && t.due_date && t.due_date >= today && t.due_date <= horizon)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    return {
      text: soon.length
        ? `${soon.length} ${plural(soon.length, 'échéance')} dans les 14 prochains jours :`
        : 'Aucune échéance dans les 14 prochains jours.',
      results: soon.slice(0, 10).map((t) => taskResult(d, t)),
    }
  }

  // ----- Expéditions / colis
  if (q.includes('colis') || q.includes('expedition') || q.includes('livraison') || q.includes('tracking') || q.includes('transporteur')) {
    const results = search(d, question, ['expedition'])
    if (results.length) return { text: 'Expéditions correspondantes :', results }
    const incidents = d.shippings.filter((s) => ['exception', 'sinistre', 'tentative'].includes(s.status ?? ''))
    return {
      text: incidents.length
        ? `${incidents.length} ${plural(incidents.length, 'expédition')} en incident :`
        : "Aucune expédition en incident. Ouvrez Planet'Dash pour le suivi complet.",
      results: incidents.slice(0, 8).map((s) => ({
        kind: 'expedition' as const,
        title: `Expédition ${s.id}`,
        subtitle: `${s.status} · ${s.transporteur ?? '—'}`,
        to: '/dash',
      })),
    }
  }

  // ----- Sinistres / litiges
  if (q.includes('sinistre') || q.includes('litige') || q.includes('casse') || q.includes('reclamation')) {
    const results = search(d, question, ['sinistre'])
    if (results.length) return { text: 'Dossiers correspondants :', results }
    const opens = d.claims.filter((c) => !['clos', 'accepte', 'refuse'].includes(c.status))
    return {
      text: opens.length ? `${opens.length} ${plural(opens.length, 'dossier')} ouvert(s) :` : 'Aucun dossier sinistre ouvert.',
      results: opens.slice(0, 8).map((c) => ({ kind: 'sinistre' as const, title: `${c.ref} — ${c.title}`, subtitle: c.status, to: '/claim' })),
    }
  }

  // ----- Absences / congés
  if (q.includes('absent') || q.includes('conge') || q.includes('vacance') || q.includes('planning')) {
    const today = new Date().toISOString().slice(0, 10)
    const nameOf = (id: string) => d.profiles.find((p) => p.id === id)?.full_name ?? '—'
    const current = d.leaves.filter((l) => l.status === 'validee' && l.start_date <= today && l.end_date >= today)
    const upcoming = d.leaves
      .filter((l) => l.status === 'validee' && l.start_date > today)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
      .slice(0, 6)
    const toRes = (l: Leave): AssistantResult => ({
      kind: 'conge',
      title: `${nameOf(l.profile_id)} — ${l.type === 'conge' ? 'Congé' : l.type}`,
      subtitle: `Du ${formatDate(l.start_date)} au ${formatDate(l.end_date)}`,
      to: '/calendrier',
    })
    return {
      text: current.length
        ? `${current.length} ${plural(current.length, 'personne')} absente(s) aujourd'hui :`
        : "Personne n'est absent aujourd'hui. Prochaines absences validées :",
      results: (current.length ? current.map(toRes) : upcoming.map(toRes)),
    }
  }

  // ----- Qui fait quoi / annuaire
  if (/^qui\b/.test(q) || q.includes('equipe') || q.includes('contact')) {
    const results = search(d, question, ['personne', 'objectif', 'tache'])
    return {
      text: results.length
        ? 'Voici ce que je trouve côté équipe et responsabilités :'
        : "Je n'ai pas trouvé de personne correspondante. L'annuaire complet est dans le module Organisation.",
      results,
    }
  }

  // ----- Documents
  if (q.includes('document') || q.includes('dossier') || q.includes('fichier') || q.includes('pdf') || q.includes('recent')) {
    const results = search(d, question, ['document'])
    const recents = [...d.documents].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return results.length
      ? { text: `${results.length} ${plural(results.length, 'document')} trouvé${results.length > 1 ? 's' : ''} :`, results }
      : {
          text: 'Aucun document ne correspond. Voici les derniers dépôts :',
          results: recents.slice(0, 6).map((doc) => ({
            kind: 'document',
            title: doc.name,
            subtitle: `Dossier ${doc.folder} · ${formatDate(doc.created_at)}`,
            to: '/documents',
          })),
        }
  }

  // ----- Liens & outils
  if (q.includes('outil') || q.includes('lien') || q.includes('appli') || q.includes('raccourci') || q.includes('logiciel')) {
    const results = search(d, question, ['lien'])
    const all = d.links.map((l): AssistantResult => ({
      kind: 'lien', title: `${l.emoji} ${l.label}`, subtitle: l.description || l.url, to: l.url, external: true,
    }))
    return {
      text: results.length ? 'Voici les outils correspondants :' : "Voici tous les outils de l'équipe (gérés dans « Liens & outils ») :",
      results: results.length ? results : all.slice(0, 10),
    }
  }

  // ----- Process / workflows
  if (q.includes('process') || q.includes('workflow') || q.includes('procedure') || q.includes('methode')) {
    const results = search(d, question, ['process'])
    const all = d.workflows.map((w): AssistantResult => ({ kind: 'process', title: w.name, subtitle: w.description.slice(0, 90), to: '/workflows' }))
    return {
      text: results.length ? 'Process correspondants :' : 'Voici les process documentés dans le module Workflows :',
      results: results.length ? results : all.slice(0, 10),
    }
  }

  // ----- Objectifs en cours
  if (q.includes('objectif') || q.includes('projet')) {
    const results = search(d, question, ['objectif'])
    if (results.length) return { text: 'Objectifs correspondants :', results }
    const current = d.objectives.filter((o) => o.status === 'en_cours')
    return {
      text: `${current.length} ${plural(current.length, 'objectif')} en cours :`,
      results: current.slice(0, 10).map((o) => ({
        kind: 'objectif',
        title: o.title,
        subtitle: `Échéance ${formatDate(o.due_date)}`,
        to: `/objectifs/${o.id}`,
      })),
    }
  }

  // ----- Recherche globale (toutes les données)
  const results = search(d, question)
  return {
    text: results.length
      ? `Voici ce que j'ai trouvé pour « ${question.trim()} » :`
      : `Je n'ai rien trouvé pour « ${question.trim()} ». Essayez d'autres mots-clés, ou parcourez les modules via le menu.`,
    results,
  }
}

export const KIND_LABELS: Record<AssistantResult['kind'], string> = {
  objectif: 'Objectif',
  tache: 'Tâche',
  note: 'Note',
  document: 'Document',
  decision: 'Décision',
  process: 'Process',
  lien: 'Outil',
  personne: 'Équipe',
  message: 'Message',
  conge: 'Congé / absence',
  expedition: 'Expédition',
  sinistre: 'Sinistre',
}
