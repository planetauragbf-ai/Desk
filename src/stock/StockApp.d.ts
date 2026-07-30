// Déclaration de types pour le module Planet'Stock (code JavaScript embarqué).
import type { ComponentType } from 'react'

export interface StockSession {
  email: string
  fullName: string
  isAdmin: boolean
}

declare const StockApp: ComponentType<{ session?: StockSession }>
export default StockApp
