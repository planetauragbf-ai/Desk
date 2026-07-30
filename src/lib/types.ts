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
  created_at: string
}

/** Message posté dans un canal */
export interface Message {
  id: string
  channel_id: string
  author_id: string | null
  content: string
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
}

export type TableName = keyof TableRowMap
