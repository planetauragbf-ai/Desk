// Mode démo : base de données locale (localStorage), même surface d'API
// que Supabase pour toutes les tables. Utilisé quand VITE_SUPABASE_URL
// n'est pas configurée, afin de pouvoir essayer l'application sans backend.
import type { TableName, TableRowMap } from './types'

const STORAGE_KEY = 'planet-aura-db-v2'

export const DEMO_USER_ID = 'demo-0000-0000-0000-000000000001'

type Db = { [K in TableName]: TableRowMap[K][] }

function iso(daysFromNow = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString()
}

function day(daysFromNow = 0): string {
  return iso(daysFromNow).slice(0, 10)
}

function uid(): string {
  return crypto.randomUUID()
}

function seed(): Db {
  const now = iso()
  const inst = {
    direction: uid(),
    communication: uid(),
    evenements: uid(),
    partenariats: uid(),
  }
  const users = {
    admin: DEMO_USER_ID,
    lea: uid(),
    marco: uid(),
    sofia: uid(),
  }
  const obj = {
    cap: uid(),
    site: uid(),
    event: uid(),
    finance: uid(),
    communaute: uid(),
  }
  const wf = { event: uid() }
  const steps = { cadrage: uid(), preparation: uid(), jourj: uid() }

  const db: Db = {
    instances: [
      { id: inst.direction, name: 'Direction Planet Aura', parent_id: null, level: 1, created_at: now },
      { id: inst.communication, name: 'Communication & Communauté', parent_id: inst.direction, level: 2, created_at: now },
      { id: inst.evenements, name: 'Événements', parent_id: inst.direction, level: 2, created_at: now },
      { id: inst.partenariats, name: 'Partenariats & Financements', parent_id: inst.direction, level: 2, created_at: now },
    ],
    profiles: [
      { id: users.admin, full_name: 'Aura Admin', email: 'planet.aura.gbf@gmail.com', role: 'admin', instance_id: inst.direction, modules: null, created_at: now },
      { id: users.lea, full_name: 'Léa Moreau', email: 'lea@planetaura.org', role: 'referent', instance_id: inst.communication, modules: null, created_at: now },
      { id: users.marco, full_name: 'Marco Silva', email: 'marco@planetaura.org', role: 'referent', instance_id: inst.evenements, modules: null, created_at: now },
      { id: users.sofia, full_name: 'Sofia Benali', email: 'sofia@planetaura.org', role: 'membre', instance_id: inst.partenariats, modules: null, created_at: now },
    ],
    objective_members: [],
    app_settings: [],
    objectives: [
      {
        id: obj.cap,
        title: '[CAP 2027] Faire de Planet Aura une organisation de référence',
        expected_result: "Structurer l'organisation, doubler la communauté active et pérenniser le financement d'ici fin 2027.",
        parent_id: null, instance_id: inst.direction, status: 'en_cours', priority: 'critique',
        start_date: day(-60), due_date: day(500), owner_id: users.admin, created_by: users.admin, created_at: iso(-60), closed_at: null,
      },
      {
        id: obj.site,
        title: 'Lancer le nouveau site web de Planet Aura',
        expected_result: "Site vitrine en ligne avec présentation de l'organisation, agenda des événements et formulaire d'adhésion.",
        parent_id: obj.cap, instance_id: inst.communication, status: 'en_cours', priority: 'haute',
        start_date: day(-20), due_date: day(45), owner_id: users.lea, created_by: users.admin, created_at: iso(-20), closed_at: null,
      },
      {
        id: obj.event,
        title: "Organiser l'événement annuel de la communauté",
        expected_result: 'Réunir au moins 100 participants, budget équilibré, satisfaction moyenne supérieure à 8/10.',
        parent_id: obj.cap, instance_id: inst.evenements, status: 'en_cours', priority: 'haute',
        start_date: day(-10), due_date: day(120), owner_id: users.marco, created_by: users.admin, created_at: iso(-10), closed_at: null,
      },
      {
        id: obj.finance,
        title: 'Sécuriser 3 partenariats financiers',
        expected_result: 'Trois conventions de partenariat signées couvrant 60% du budget annuel.',
        parent_id: obj.cap, instance_id: inst.partenariats, status: 'non_initie', priority: 'critique',
        start_date: day(0), due_date: day(180), owner_id: users.sofia, created_by: users.admin, created_at: iso(-5), closed_at: null,
      },
      {
        id: obj.communaute,
        title: 'Animer la communauté en ligne',
        expected_result: 'Publication hebdomadaire, +50% de membres actifs sur le serveur communautaire.',
        parent_id: obj.cap, instance_id: inst.communication, status: 'en_cours', priority: 'moyenne',
        start_date: day(-40), due_date: day(200), owner_id: users.lea, created_by: users.lea, created_at: iso(-40), closed_at: null,
      },
    ],
    tasks: [
      { id: uid(), objective_id: obj.site, title: 'Rédiger le cahier des charges du site', description: '', status: 'termine', priority: 'haute', due_date: day(-7), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.lea, workflow_group: null, estimated_hours: 8, spent_hours: 10, created_at: iso(-20), completed_at: iso(-8) },
      { id: uid(), objective_id: obj.site, title: "Choisir l'hébergement et le nom de domaine", description: '', status: 'en_cours', priority: 'moyenne', due_date: day(5), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.admin, workflow_group: null, estimated_hours: 3, spent_hours: 1, created_at: iso(-15), completed_at: null },
      { id: uid(), objective_id: obj.site, title: 'Créer la maquette des pages principales', description: '', status: 'a_faire', priority: 'haute', due_date: day(15), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.lea, workflow_group: null, estimated_hours: 12, spent_hours: null, created_at: iso(-10), completed_at: null },
      { id: uid(), objective_id: obj.site, title: 'Rédiger les contenus des pages', description: '', status: 'a_faire', priority: 'moyenne', due_date: day(25), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.sofia, workflow_group: null, estimated_hours: 10, spent_hours: null, created_at: iso(-10), completed_at: null },
      { id: uid(), objective_id: obj.event, title: 'Définir la date et le lieu', description: '', status: 'en_cours', priority: 'critique', due_date: day(7), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.marco, workflow_group: 'Cadrage', estimated_hours: 4, spent_hours: 2, created_at: iso(-9), completed_at: null },
      { id: uid(), objective_id: obj.event, title: 'Établir le budget prévisionnel', description: '', status: 'a_faire', priority: 'haute', due_date: day(14), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.marco, workflow_group: 'Cadrage', estimated_hours: 6, spent_hours: null, created_at: iso(-9), completed_at: null },
      { id: uid(), objective_id: obj.event, title: "Constituer l'équipe organisatrice", description: '', status: 'validation', priority: 'moyenne', due_date: day(3), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.admin, workflow_group: 'Cadrage', estimated_hours: 2, spent_hours: 2, created_at: iso(-8), completed_at: null },
      { id: uid(), objective_id: obj.communaute, title: 'Planifier le calendrier éditorial du mois', description: '', status: 'en_cours', priority: 'moyenne', due_date: day(-2), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.lea, workflow_group: null, estimated_hours: 3, spent_hours: 3, created_at: iso(-12), completed_at: null },
      { id: uid(), objective_id: obj.finance, title: 'Lister les partenaires potentiels', description: '', status: 'a_faire', priority: 'haute', due_date: day(10), assigned_kind: 'salarie' as const, external_name: null, validator_id: null, assignee_id: users.sofia, workflow_group: null, estimated_hours: 5, spent_hours: null, created_at: iso(-4), completed_at: null },
    ],
    workflow_templates: [
      { id: wf.event, name: "Organisation d'un événement", description: "Processus standard de préparation d'un événement communautaire Planet Aura.", owner_id: users.marco, status: 'utilisee', created_at: iso(-30), updated_at: iso(-9) },
    ],
    workflow_steps: [
      { id: steps.cadrage, template_id: wf.event, position: 1, title: 'Cadrage' },
      { id: steps.preparation, template_id: wf.event, position: 2, title: 'Préparation' },
      { id: steps.jourj, template_id: wf.event, position: 3, title: 'Jour J et bilan' },
    ],
    workflow_actions: [
      { id: uid(), step_id: steps.cadrage, position: 1, title: 'Définir objectif, date, lieu et budget' },
      { id: uid(), step_id: steps.cadrage, position: 2, title: "Constituer l'équipe organisatrice" },
      { id: uid(), step_id: steps.preparation, position: 1, title: 'Réserver le lieu et les prestataires' },
      { id: uid(), step_id: steps.preparation, position: 2, title: 'Lancer la communication et les inscriptions' },
      { id: uid(), step_id: steps.jourj, position: 1, title: 'Coordonner la logistique du jour J' },
      { id: uid(), step_id: steps.jourj, position: 2, title: 'Collecter les retours et rédiger le bilan' },
    ],
    notes: [
      { id: uid(), title: 'Compte-rendu kick-off refonte site', content: "Décisions du kick-off : cible de mise en ligne dans 6 semaines, priorité aux pages Présentation, Agenda et Adhésion.", objective_id: obj.site, task_id: null, author_id: users.lea, shared: true, created_at: iso(-14), updated_at: iso(-14) },
      { id: uid(), title: "Idées de lieux pour l'événement annuel", content: 'Salle des fêtes municipale, campus associatif, tiers-lieu partenaire. Comparer capacité et coût.', objective_id: obj.event, task_id: null, author_id: users.marco, shared: true, created_at: iso(-6), updated_at: iso(-3) },
    ],
    documents: [
      { id: uid(), name: 'Cahier des charges — site web v1.pdf', folder: 'Projets', storage_path: null, url: null, objective_id: obj.site, task_id: null, author_id: users.lea, created_at: iso(-8) },
      { id: uid(), name: 'Statuts Planet Aura.pdf', folder: 'Directives', storage_path: null, url: null, objective_id: null, task_id: null, author_id: users.admin, created_at: iso(-60) },
    ],
    decisions: [
      { id: uid(), objective_id: obj.site, title: 'Choix du CMS ou développement sur mesure', context: "Comparer coût, autonomie de l'équipe et délais de mise en ligne.", status: 'en_instruction', outcome: '', decided_by: null, decided_at: null, created_at: iso(-10) },
      { id: uid(), objective_id: obj.event, title: "Événement payant ou gratuit", context: 'Impact sur le budget et sur la participation.', status: 'arbitree', outcome: 'Entrée gratuite, buvette et goodies payants pour équilibrer le budget.', decided_by: users.admin, decided_at: iso(-4), created_at: iso(-8) },
    ],
    indicators: [
      { id: uid(), objective_id: obj.site, name: 'Pages publiées', unit: 'pages', target_value: 8, current_value: 2, due_date: day(45), updated_at: iso(-2) },
      { id: uid(), objective_id: obj.event, name: 'Participants inscrits', unit: 'pers.', target_value: 100, current_value: 0, due_date: day(110), updated_at: iso(-2) },
      { id: uid(), objective_id: obj.communaute, name: 'Membres actifs', unit: 'membres', target_value: 300, current_value: 180, due_date: day(200), updated_at: iso(-1) },
    ],
    notifications: [
      { id: uid(), user_id: DEMO_USER_ID, message: "3 tâches arrivent à échéance dans les 7 prochains jours.", link: '/tableau-de-bord', read: false, created_at: iso(-1) },
      { id: uid(), user_id: DEMO_USER_ID, message: "La décision « Événement payant ou gratuit » a été arbitrée.", link: null, read: false, created_at: iso(-4) },
    ],
  }
  return db
}

function load(): Db {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as Db
    } catch {
      // base corrompue : on repart du seed
    }
  }
  const db = seed()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  return db
}

function save(db: Db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

type Row = { id: string } & Record<string, unknown>

export const localDb = {
  list<K extends TableName>(table: K, where?: Partial<TableRowMap[K]>): TableRowMap[K][] {
    const rows = (load()[table] ?? []) as unknown as Row[]
    const filtered = where
      ? rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))
      : [...rows]
    return filtered as unknown as TableRowMap[K][]
  },
  get<K extends TableName>(table: K, id: string): TableRowMap[K] | null {
    const rows = (load()[table] ?? []) as unknown as Row[]
    return (rows.find((r) => r.id === id) as unknown as TableRowMap[K]) ?? null
  },
  insert<K extends TableName>(table: K, row: Partial<TableRowMap[K]>): TableRowMap[K] {
    const db = load()
    if (!db[table]) (db as Record<string, unknown>)[table] = []
    const full = { id: uid(), created_at: iso(), ...row } as unknown as Row
    ;(db[table] as unknown as Row[]).push(full)
    save(db)
    return full as unknown as TableRowMap[K]
  },
  update<K extends TableName>(table: K, id: string, patch: Partial<TableRowMap[K]>): TableRowMap[K] {
    const db = load()
    const rows = db[table] as unknown as Row[]
    const idx = rows.findIndex((r) => r.id === id)
    if (idx === -1) throw new Error(`Ligne introuvable : ${table}/${id}`)
    rows[idx] = { ...rows[idx], ...patch }
    save(db)
    return rows[idx] as unknown as TableRowMap[K]
  },
  remove<K extends TableName>(table: K, id: string): void {
    const db = load()
    const rows = db[table] as unknown as Row[]
    ;(db[table] as unknown as Row[]).splice(0, rows.length, ...rows.filter((r) => r.id !== id))
    save(db)
  },
  reset(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
