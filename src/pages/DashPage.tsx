import { Suspense, lazy } from 'react'

// Planet'Dash (dashboard de suivi des expéditions, CDC Ship24) : chargé à
// la demande. Ses données vivent dans app_state (clé pa-dash-v1).
const DashApp = lazy(() => import('../dash/DashApp'))

export default function DashPage() {
  return (
    <Suspense
      fallback={<div className="min-h-[60vh] flex items-center justify-center text-aura-700">Chargement de Planet'Dash…</div>}
    >
      <DashApp />
    </Suspense>
  )
}
