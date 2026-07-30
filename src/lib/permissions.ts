// Gestion des accès : modules visibles par salarié, autorisations
// détaillées et périmètre de projets/objectifs autorisé.
// Les administrateurs voient tout.
import type { DetailedPerms, Objective, ObjectiveMember, Profile, Task } from './types'

export const MODULES = [
  { key: 'chat', label: 'Chat interne' },
  { key: 'assistant', label: 'Assistant' },
  { key: 'documents', label: 'Documents' },
  { key: 'liens', label: 'Liens & outils' },
  { key: 'calendrier', label: 'Calendrier & congés' },
  { key: 'objectifs', label: 'Objectifs' },
  { key: 'pilotage', label: 'Pilotage' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'notes', label: 'Notes' },
  { key: 'dash', label: "Planet'Dash (suivi logistique)" },
  { key: 'stock', label: "Planet'Stock (stockage & picking)" },
  { key: 'claim', label: "Planet'Claim (sinistres)" },
] as const

/** Autorisations fines, gérées personne par personne par l'admin. */
export const PERM_DETAILS: { key: keyof DetailedPerms; label: string }[] = [
  { key: 'chat_canaux', label: 'Créer des canaux de chat' },
  { key: 'documents_ajout', label: 'Ajouter / modifier / supprimer des documents' },
  { key: 'documents_dossiers', label: 'Gérer les dossiers de documents' },
  { key: 'liens_ajout', label: 'Ajouter / modifier / supprimer des liens' },
  { key: 'liens_dossiers', label: 'Gérer les catégories de liens' },
  { key: 'notes_ajout', label: 'Créer / modifier / supprimer des notes' },
]

/** Autorisation détaillée : admins toujours autorisés ; sinon perms[key] !== false. */
export function can(profile: Profile | null, key: keyof DetailedPerms): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.perms?.[key] !== false
}

export type ModuleKey = (typeof MODULES)[number]['key']

/** Créer des objectifs (et sous-objectifs) : administrateurs et référents. */
export function canCreateObjectives(profile: Profile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'referent'
}

export function canAccessModule(profile: Profile | null, module: ModuleKey): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  if (!profile.modules) return true // null = tous les modules
  return profile.modules.includes(module)
}

/**
 * Objectifs visibles par un salarié :
 * - admin : tous ;
 * - sinon : les objectifs accordés explicitement (objective_members),
 *   ceux dont il est référent ou créateur, ceux où une tâche lui est
 *   attribuée — et, par héritage, tous leurs sous-objectifs.
 */
export function visibleObjectives(
  profile: Profile | null,
  objectives: Objective[],
  members: ObjectiveMember[],
  tasks: Task[],
): Objective[] {
  if (!profile) return []
  if (profile.role === 'admin') return objectives

  const visible = new Set<string>()
  for (const m of members) if (m.profile_id === profile.id) visible.add(m.objective_id)
  for (const o of objectives) {
    if (o.owner_id === profile.id || o.created_by === profile.id) visible.add(o.id)
  }
  for (const t of tasks) {
    if (t.assignee_id === profile.id && t.objective_id) visible.add(t.objective_id)
  }

  // Héritage : un accès à un objectif ouvre tout son sous-arbre.
  let changed = true
  while (changed) {
    changed = false
    for (const o of objectives) {
      if (o.parent_id && visible.has(o.parent_id) && !visible.has(o.id)) {
        visible.add(o.id)
        changed = true
      }
    }
  }
  return objectives.filter((o) => visible.has(o.id))
}
