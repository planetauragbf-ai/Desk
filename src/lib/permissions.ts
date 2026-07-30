// Gestion des accès : modules visibles par salarié et périmètre
// de projets/objectifs autorisé. Les administrateurs voient tout.
import type { Objective, ObjectiveMember, Profile, Task } from './types'

export const MODULES = [
  { key: 'objectifs', label: 'Objectifs' },
  { key: 'pilotage', label: 'Pilotage' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'notes', label: 'Notes' },
  { key: 'documents', label: 'Documents' },
  { key: 'organisation', label: 'Organisation' },
] as const

export type ModuleKey = (typeof MODULES)[number]['key']

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
