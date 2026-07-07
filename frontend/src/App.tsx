import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { authService } from './services/auth'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AgendaPage from './pages/AgendaPage'
import LeadsPage from './pages/LeadsPage'
import PerformancePage from './pages/PerformancePage'
import NegociosPage from './pages/NegociosPage'
import UsuariosPage from './pages/UsuariosPage'
import ImportarLeadsPage from './pages/ImportarLeadsPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'
import PersonalizacaoPage from './pages/PersonalizacaoPage'
import DistribuicaoLeadsPage from './pages/DistribuicaoLeadsPage'
import CampanhasPage from './pages/CampanhasPage'
import BugReportsPage from './pages/BugReportsPage'
import NotFoundPage from './pages/NotFoundPage'

import { useConfigStore } from './store/configStore'
import api from './services/api'

function RootRedirect() {
  const token = useAuthStore((state) => state.token)
  return token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
}

export default function App() {
  const isChecking = useAuthStore((state) => state.isChecking)
  const setAuth = useAuthStore((state) => state.setAuth)
  const logout = useAuthStore((state) => state.logout)
  const setConfig = useConfigStore((state) => state.setConfig)

  useEffect(() => {
    // Fetch global config on mount
    api.get('/settings/personalizacao')
      .then(res => setConfig(res.data))
      .catch(err => console.error('Failed to load config:', err))

    // Verificação de sessão ao carregar a página
    Promise.all([
      authService.getMe(),
      authService.getMyPermissions().catch(() => [])
    ])
      .then(([user, permissions]) => {
        // Guardamos um token fictício em memória para que o resto da aplicação que dependa dele funcione
        setAuth(user, 'session-active', permissions)
      })
      .catch(() => {
        logout()
      })
  }, [setAuth, logout, setConfig])

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--accent)]"></div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public Login Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Routes sharing Layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/campanhas" element={<CampanhasPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/negocios" element={<NegociosPage />} />
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="/importar-leads" element={<ImportarLeadsPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/personalizacao" element={<PersonalizacaoPage />} />
        <Route path="/distribuicao-leads" element={<DistribuicaoLeadsPage />} />
        <Route path="/bug-reports" element={<BugReportsPage />} />
      </Route>

      {/* Fallback 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
