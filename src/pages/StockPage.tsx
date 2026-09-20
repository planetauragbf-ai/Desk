import { Suspense, lazy } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Skeleton } from '../components/ui'

// Planet'Stock est un module volumineux (QR codes, PDF, 3D) : chargé à la
// demande pour ne pas alourdir le reste de l'application. Sa navigation
// vit dans le bandeau gauche de Planet'Desk (paramètre ?onglet=…).
const StockApp = lazy(() => import('../stock/StockApp'))

export default function StockPage() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  return (
    <Suspense
      fallback={
        <div className="p-4 md:p-6 max-w-3xl">
          <Skeleton lines={6} />
        </div>
      }
    >
      <StockApp
        forcedTab={params.get('onglet') ?? undefined}
        // La barre d'onglets mobile du module change d'écran en passant par
        // l'URL : le menu du Desk et le module restent ainsi synchronisés
        // (et le retour arrière du navigateur retraverse les onglets).
        onTabChange={(id) => setParams({ onglet: id })}
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
