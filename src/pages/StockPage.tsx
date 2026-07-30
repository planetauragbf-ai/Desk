import { Suspense, lazy } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Planet'Stock est un module volumineux (QR codes, PDF, 3D) : chargé à la
// demande pour ne pas alourdir le reste de l'application. Sa navigation
// vit dans le bandeau gauche de Planet'Desk (paramètre ?onglet=…).
const StockApp = lazy(() => import('../stock/StockApp'))

export default function StockPage() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  return (
    <Suspense
      fallback={<div className="min-h-[60vh] flex items-center justify-center text-aura-700">Chargement de Planet'Stock…</div>}
    >
      <StockApp
        forcedTab={params.get('onglet') ?? undefined}
        session={
          profile
            ? {
                email: profile.email,
                fullName: profile.full_name,
                isAdmin: profile.role === 'admin',
                stockAccess: profile.stock_access ?? null,
              }
            : undefined
        }
      />
    </Suspense>
  )
}
