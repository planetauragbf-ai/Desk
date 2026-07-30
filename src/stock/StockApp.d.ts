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

declare const StockApp: ComponentType<{ session?: StockSession }>
export default StockApp
