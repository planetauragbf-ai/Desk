// Déclaration de types pour la persistance de Planet'Dash (module JavaScript).
import type { DashShipping } from '../lib/assistant'

export interface DashState {
  shippings?: DashShipping[]
  prodSheets?: string[]
}

export function loadDash(): Promise<DashState | null>
export function saveDash(value: DashState): void
export function surConflitDash(fn: (() => void) | null): () => void
export function rechargerDash(): Promise<DashState | null>
