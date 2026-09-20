// Déclaration de types pour le module Planet'Stock (code JavaScript embarqué).
import type { ComponentType } from 'react'
import type { StockAccess } from '../lib/types'

export interface StockSession {
  email: string
  fullName: string
  isAdmin: boolean
  /** Droits définis par l'administrateur dans Planet'Desk */
  stockAccess?: StockAccess | null
}

declare const StockApp: ComponentType<{
  session?: StockSession
  forcedTab?: string
  /** Changement d'onglet demandé par le module (barre mobile) : le Desk met l'URL à jour. */
  onTabChange?: (id: string) => void
}>
export default StockApp
