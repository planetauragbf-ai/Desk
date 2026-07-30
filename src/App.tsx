import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import { canAccessModule, type ModuleKey } from './lib/permissions'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Objectives from './pages/Objectives'
import ObjectiveDetail from './pages/ObjectiveDetail'
import Pilotage from './pages/Pilotage'
import Workflows from './pages/Workflows'
import NotesPage from './pages/NotesPage'
import DocumentsPage from './pages/DocumentsPage'
import Organisation from './pages/Organisation'
import Administration from './pages/Administration'
import SetPassword from './pages/SetPassword'
import ChatPage from './pages/ChatPage'
import AssistantPage from './pages/AssistantPage'
import LinksPage from './pages/LinksPage'
import StockPage from './pages/StockPage'

function Guard({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { profile } = useAuth()
  if (!canAccessModule(profile, module)) return <Navigate to="/tableau-de-bord" replace />
  return <>{children}</>
}

export default function App() {
  const { loading, profile, passwordRecovery } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-aura-700">
        Chargement de votre espace…
      </div>
    )
  }

  if (passwordRecovery) return <SetPassword />

  if (!profile) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/tableau-de-bord" replace />} />
        <Route path="/tableau-de-bord" element={<Dashboard />} />
        <Route path="/chat" element={<Guard module="chat"><ChatPage /></Guard>} />
        <Route path="/assistant" element={<Guard module="assistant"><AssistantPage /></Guard>} />
        <Route path="/liens" element={<Guard module="liens"><LinksPage /></Guard>} />
        <Route path="/stock/*" element={<Guard module="stock"><StockPage /></Guard>} />
        <Route path="/objectifs" element={<Guard module="objectifs"><Objectives /></Guard>} />
        <Route path="/objectifs/:id" element={<Guard module="objectifs"><ObjectiveDetail /></Guard>} />
        <Route path="/pilotage" element={<Guard module="pilotage"><Pilotage /></Guard>} />
        <Route path="/workflows" element={<Guard module="workflows"><Workflows /></Guard>} />
        <Route path="/notes" element={<Guard module="notes"><NotesPage /></Guard>} />
        <Route path="/documents" element={<Guard module="documents"><DocumentsPage /></Guard>} />
        <Route path="/organisation" element={<Guard module="organisation"><Organisation /></Guard>} />
        <Route path="/administration" element={<Administration />} />
        <Route path="*" element={<Navigate to="/tableau-de-bord" replace />} />
      </Route>
    </Routes>
  )
}
