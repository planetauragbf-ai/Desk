import type { Priority, TaskStatus, ObjectiveStatus, DecisionStatus, Profile } from './types'

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
    ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function profileName(profiles: Profile[], id: string | null | undefined): string {
  if (!id) return '—'
  return profiles.find((p) => p.id === id)?.full_name ?? '—'
}

export function isPast(d: string | null | undefined): boolean {
  return !!d && d < new Date().toISOString().slice(0, 10)
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  validation: 'En validation',
  termine: 'Terminé',
}

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  non_initie: 'Non initié',
  en_cours: 'En cours',
  termine: 'Terminé',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  basse: 'Basse',
  moyenne: 'Moyenne',
  haute: 'Haute',
  critique: 'Critique',
}

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  a_instruire: 'À instruire',
  en_instruction: 'En instruction',
  arbitree: 'Arbitrée',
}
