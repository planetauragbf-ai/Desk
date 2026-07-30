// Calculs de consolidation : avancement, probabilité de résultat,
// indices de maîtrise/réalité — inspirés de la logique Eidō, adaptés
// en heuristiques simples et transparentes.
import type { Objective, Task, Indicator } from './types'

export interface ObjectiveStats {
  /** Avancement consolidé 0..100 (tâches directes + sous-objectifs) */
  completion: number
  /** Probabilité de résultat 0..100 */
  probability: number
  /** Indice de réalité 0..10 : ce qui est fait, pondéré par le respect des échéances */
  realityIndex: number
  /** Indice de maîtrise 0..10 : cadrage (échéances posées, tâches attribuées, indicateurs) */
  masteryIndex: number
  taskCount: number
  doneCount: number
  overdueCount: number
  pendingValidation: number
  childIds: string[]
}

function isOverdue(t: Task): boolean {
  return t.status !== 'termine' && !!t.due_date && t.due_date < new Date().toISOString().slice(0, 10)
}

function taskProgress(t: Task): number {
  switch (t.status) {
    case 'termine': return 1
    case 'validation': return 0.9
    case 'en_cours': return 0.5
    default: return 0
  }
}

export function childrenOf(objectives: Objective[], parentId: string): Objective[] {
  return objectives.filter((o) => o.parent_id === parentId)
}

export function descendantsOf(objectives: Objective[], rootId: string): Objective[] {
  const out: Objective[] = []
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    for (const child of childrenOf(objectives, id)) {
      out.push(child)
      stack.push(child.id)
    }
  }
  return out
}

export function computeStats(
  objective: Objective,
  objectives: Objective[],
  tasks: Task[],
  indicators: Indicator[],
): ObjectiveStats {
  const children = childrenOf(objectives, objective.id)
  const scope = [objective, ...descendantsOf(objectives, objective.id)]
  const scopeIds = new Set(scope.map((o) => o.id))
  const scopeTasks = tasks.filter((t) => t.objective_id && scopeIds.has(t.objective_id))

  const taskCount = scopeTasks.length
  const doneCount = scopeTasks.filter((t) => t.status === 'termine').length
  const overdueCount = scopeTasks.filter(isOverdue).length
  const pendingValidation = scopeTasks.filter((t) => t.status === 'validation').length

  let completion: number
  if (objective.status === 'termine') completion = 100
  else if (taskCount === 0) completion = objective.status === 'en_cours' ? 10 : 0
  else completion = Math.round((scopeTasks.reduce((s, t) => s + taskProgress(t), 0) / taskCount) * 100)

  // Réalité : avancement, pénalisé par les retards.
  const overdueRatio = taskCount ? overdueCount / taskCount : 0
  const realityIndex = Math.max(0, Math.min(10, (completion / 10) * (1 - 0.5 * overdueRatio)))

  // Maîtrise : le périmètre est-il cadré ? (dates, attributions, indicateurs, plan d'actions)
  const objIndicators = indicators.filter((i) => scopeIds.has(i.objective_id))
  const assignedRatio = taskCount ? scopeTasks.filter((t) => t.assignee_id).length / taskCount : 0
  const datedRatio = taskCount ? scopeTasks.filter((t) => t.due_date).length / taskCount : 0
  let mastery = 0
  if (objective.due_date) mastery += 2.5
  if (taskCount > 0) mastery += 2.5
  mastery += 2.5 * assignedRatio
  mastery += 1.5 * datedRatio
  if (objIndicators.length > 0) mastery += 1
  const masteryIndex = Math.min(10, mastery)

  // Probabilité de résultat : avancement vs temps écoulé, corrigé des retards.
  let probability = 50
  const today = new Date().toISOString().slice(0, 10)
  if (objective.status === 'termine') {
    probability = 100
  } else if (objective.start_date && objective.due_date && objective.due_date > objective.start_date) {
    const total = Date.parse(objective.due_date) - Date.parse(objective.start_date)
    const elapsed = Math.max(0, Math.min(total, Date.now() - Date.parse(objective.start_date)))
    const expected = (elapsed / total) * 100
    probability = Math.round(Math.max(2, Math.min(98, 50 + (completion - expected) * 0.8 - overdueRatio * 30 + masteryIndex * 2)))
    if (objective.due_date < today) probability = Math.min(probability, 25)
  } else {
    probability = Math.round(Math.max(2, Math.min(98, 30 + completion * 0.4 + masteryIndex * 3)))
  }

  return {
    completion,
    probability,
    realityIndex: Math.round(realityIndex * 100) / 100,
    masteryIndex: Math.round(masteryIndex * 100) / 100,
    taskCount,
    doneCount,
    overdueCount,
    pendingValidation,
    childIds: children.map((c) => c.id),
  }
}

/** Objectif critique : en retard ou probabilité faible. */
export function isCritical(stats: ObjectiveStats, objective: Objective): boolean {
  if (objective.status === 'termine') return false
  return stats.probability < 40 || stats.overdueCount > 0
}
