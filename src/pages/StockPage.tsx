import { Suspense, lazy } from 'react'
import { useAuth } from '../context/AuthContext'

// Planet'Stock est un module volumineux (QR codes, PDF, 3D) : chargé à la
// demande pour ne pas alourdir le reste de l'application.
const StockApp = lazy(() => import('../stock/StockApp'))

export default function StockPage() {
  const { profile } = useAuth()
  return (
    <Suspense
      fallback={<div className="min-h-[60vh] flex items-center justify-center text-aura-700">Chargement de Planet'Stock…</div>}
    >
      <StockApp
        session={
          profile
            ? { email: profile.email, fullName: profile.full_name, isAdmin: profile.role === 'admin' }
            : undefined
        }
      />
    </Suspense>
  )
}
