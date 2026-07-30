import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Objectives from './pages/Objectives'
import ObjectiveDetail from './pages/ObjectiveDetail'
import Pilotage from './pages/Pilotage'
import Workflows from './pages/Workflows'
import NotesPage from './pages/NotesPage'
import DocumentsPage from './pages/DocumentsPage'
import Organisation from './pages/Organisation'

export default function App() {
  const { loading, profile } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-aura-700">
        Chargement de votre espace…
      </div>
    )
  }

  if (!profile) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/tableau-de-bord" replace />} />
        <Route path="/tableau-de-bord" element={<Dashboard />} />
        <Route path="/objectifs" element={<Objectives />} />
        <Route path="/objectifs/:id" element={<ObjectiveDetail />} />
        <Route path="/pilotage" element={<Pilotage />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/organisation" element={<Organisation />} />
        <Route path="*" element={<Navigate to="/tableau-de-bord" replace />} />
      </Route>
    </Routes>
  )
}
