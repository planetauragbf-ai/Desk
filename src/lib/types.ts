export type ObjectiveStatus = 'non_initie' | 'en_cours' | 'termine'
export type TaskStatus = 'a_faire' | 'en_cours' | 'validation' | 'termine'
export type Priority = 'basse' | 'moyenne' | 'haute' | 'critique'
export type DecisionStatus = 'a_instruire' | 'en_instruction' | 'arbitree'

export interface Instance {
  id: string
  name: string
  parent_id: string | null
  level: number
  created_at: string
}

/** Droits d'un salarié sur l'application Planet'Stock, définis par l'admin */
export interface StockAccess {
  role: 'admin' | 'logisticien' | 'adherent'
  /** Onglets ouverts pour un logisticien */
  permissions?: {
    entrees?: boolean
    sorties?: boolean
    espaces?: boolean
    facturation?: boolean
    compta?: boolean
    grille?: boolean
  }
  /** Pour un adhérent : identifiant de sa fiche (ADH001…) */
  adherent_id?: string | null
}

/** Autorisations détaillées ; clé absente ou true = autorisé, false = interdit */
export type DetailedPerms = Partial<Record<
  | 'chat_canaux'
  | 'documents_ajout'
  | 'documents_dossiers'
  | 'liens_ajout'
  | 'liens_dossiers'
  | 'notes_ajout',
  boolean
>>

export interface Profile {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'referent' | 'membre'
  instance_id: string | null
  /** Modules accessibles ; null = tous les modules */
  modules: string[] | null
  /** Accès Planet'Stock défini par l'admin ; null = correspondance email / admin */
  stock_access?: StockAccess | null
  /** Accès désactivé par l'administrateur */
  disabled?: boolean
  /** Autorisations détaillées (null = tout autorisé) */
  perms?: DetailedPerms | null
  /** Service compta : valide les congés après l'admin */
  is_compta?: boolean
  /** Doit changer son mot de passe provisoire à la première connexion */
  must_change_password?: boolean
  /** Droits de congés payés annuels (jours) */
  cp_droits?: number
  created_at: string
}

/** Droit de visibilité d'un salarié sur un objectif (et son sous-arbre) */
export interface ObjectiveMember {
  id: string
  objective_id: string
  profile_id: string
  created_at: string
}

export interface Objective {
  id: string
  title: string
  expected_result: string
  parent_id: string | null
  instance_id: string | null
  status: ObjectiveStatus
  priority: Priority
  start_date: string | null
  due_date: string | null
  owner_id: string | null
  created_by: string | null
  created_at: string
  closed_at: string | null
}

export interface Task {
  id: string
  objective_id: string | null
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  due_date: string | null
  /** Qui fait : un salarié (assignee_id) ou un client/partenaire externe (external_name) */
  assigned_kind: 'salarie' | 'client'
  external_name: string | null
  assignee_id: string | null
  /** Qui valide : si défini, terminer la tâche demande sa validation */
  validator_id: string | null
  workflow_group: string | null
  estimated_hours: number | null
  spent_hours: number | null
  created_at: string
  completed_at: string | null
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  owner_id: string | null
  status: 'a_utiliser' | 'utilisee'
  created_at: string
  updated_at: string
}

export interface WorkflowStep {
  id: string
  template_id: string
  position: number
  title: string
}

export interface WorkflowAction {
  id: string
  step_id: string
  position: number
  title: string
}

export interface Note {
  id: string
  title: string
  content: string
  objective_id: string | null
  task_id: string | null
  author_id: string | null
  shared: boolean
  created_at: string
  updated_at: string
}

export interface DocumentMeta {
  id: string
  name: string
  folder: string
  storage_path: string | null
  url: string | null
  objective_id: string | null
  task_id: string | null
  author_id: string | null
  created_at: string
}

export interface Decision {
  id: string
  objective_id: string | null
  title: string
  context: string
  status: DecisionStatus
  outcome: string
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

export interface Indicator {
  id: string
  objective_id: string
  name: string
  unit: string
  target_value: number
  current_value: number
  due_date: string | null
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

/** Réglage global de l'application (clé/valeur), ex. logo personnalisé */
export interface AppSetting {
  id: string
  key: string
  value: string
  updated_at: string
}

/** Canal de discussion du chat interne */
export interface Channel {
  id: string
  name: string
  description: string
  created_by: string | null
  /** Canal privé : visible uniquement de ses membres (et des admins) */
  private?: boolean
  /** Message privé type WhatsApp : visible uniquement de ses membres */
  dm?: boolean
  created_at: string
}

export type ClaimKind = 'sinistre' | 'litige'
export type ClaimCategory = 'casse' | 'perte' | 'vol' | 'retard' | 'temperature' | 'erreur_livraison' | 'facturation' | 'autre'
export type ClaimStatus = 'nouveau' | 'en_cours' | 'attente_transporteur' | 'attente_assurance' | 'attente_client' | 'accepte' | 'refuse' | 'clos'

/** Dossier de sinistre ou de litige (Planet'Claim) */
export interface Claim {
  id: string
  ref: string
  kind: ClaimKind
  category: ClaimCategory
  status: ClaimStatus
  priority: Priority
  title: string
  description: string
  shipping_ref: string
  tracking_number: string
  carrier: string
  adherent: string
  destinataire: string
  pays: string
  date_incident: string | null
  deadline: string | null
  montant_estime: number
  montant_reclame: number
  montant_recupere: number
  assureur: string
  assignee_id: string | null
  created_by: string | null
  created_at: string
  closed_at: string | null
}

/** Événement de l'historique d'un dossier (commentaire, statut, document) */
export interface ClaimEvent {
  id: string
  claim_id: string
  author_id: string | null
  kind: 'commentaire' | 'statut' | 'document'
  content: string
  file_url?: string | null
  file_name?: string | null
  created_at: string
}

/** Heures supplémentaires ou retard, à la minute */
export interface TimeEntry {
  id: string
  profile_id: string
  kind: 'hsupp' | 'retard'
  date: string
  minutes: number
  note: string
  created_by: string | null
  created_at: string
}

/** Membre d'un canal privé */
export interface ChannelMember {
  id: string
  channel_id: string
  profile_id: string
  created_at: string
}

/** Message posté dans un canal (texte, pièce jointe et/ou sondage) */
export interface Message {
  id: string
  channel_id: string
  author_id: string | null
  content: string
  file_url?: string | null
  file_name?: string | null
  file_type?: 'image' | 'pdf' | 'fichier' | null
  /** Questionnaire : {"question":"…","options":["…"]} */
  poll?: { question: string; options: string[] } | null
  created_at: string
}

/** Vote d'un salarié sur un sondage */
export interface PollVote {
  id: string
  message_id: string
  profile_id: string
  option_index: number
  created_at: string
}

export type LeaveType = 'conge' | 'maladie' | 'ecole' | 'formation' | 'teletravail' | 'recup' | 'absence' | 'retard'
export type LeaveStatus = 'en_attente' | 'validee_admin' | 'validee' | 'refusee'

/** Demande de congé / absence, validée par un admin puis par la compta */
export interface Leave {
  id: string
  profile_id: string
  type: LeaveType
  start_date: string
  end_date: string
  reason: string
  status: LeaveStatus
  admin_by: string | null
  admin_at: string | null
  compta_by: string | null
  compta_at: string | null
  refusal_reason: string
  created_at: string
}

/** Entrée du journal d'activité global (qui a fait quoi, dans quelle app) */
export interface AuditEntry {
  id: string
  user_id: string | null
  user_name: string
  app: string
  action: string
  created_at: string
}

/** Dossier des espaces Documents ('documents') et Liens & outils ('liens') */
export interface Folder {
  id: string
  kind: 'documents' | 'liens'
  name: string
  created_at: string
}

/** Lien vers un outil, une application ou un raccourci de l'équipe */
export interface LinkItem {
  id: string
  label: string
  url: string
  description: string
  category: string
  emoji: string
  author_id: string | null
  created_at: string
}

export interface TableRowMap {
  instances: Instance
  profiles: Profile
  objective_members: ObjectiveMember
  app_settings: AppSetting
  objectives: Objective
  tasks: Task
  workflow_templates: WorkflowTemplate
  workflow_steps: WorkflowStep
  workflow_actions: WorkflowAction
  notes: Note
  documents: DocumentMeta
  decisions: Decision
  indicators: Indicator
  notifications: Notification
  channels: Channel
  messages: Message
  links: LinkItem
  folders: Folder
  audit_log: AuditEntry
  channel_members: ChannelMember
  poll_votes: PollVote
  leaves: Leave
  time_entries: TimeEntry
  claims: Claim
  claim_events: ClaimEvent
}

export type TableName = keyof TableRowMap
