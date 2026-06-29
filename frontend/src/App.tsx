import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { authService } from './services/auth'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LeadsPage from './pages/LeadsPage'
import PerformancePage from './pages/PerformancePage'
import NegociosPage from './pages/NegociosPage'
import UsuariosPage from './pages/UsuariosPage'
import ImportarLeadsPage from './pages/ImportarLeadsPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'
import PersonalizacaoPage from './pages/PersonalizacaoPage'
import DistribuicaoLeadsPage from './pages/DistribuicaoLeadsPage'
import NotFoundPage from './pages/NotFoundPage'

import { useConfigStore } from './store/configStore'
import api from './services/api'

function RootRedirect() {
  const token = useAuthStore((state) => state.token)
  return token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
}

export default function App() {
  const token = useAuthStore((state) => state.token)
  const setAuth = useAuthStore((state) => state.setAuth)
  const logout = useAuthStore((state) => state.logout)
  const setConfig = useConfigStore((state) => state.setConfig)

  useEffect(() => {
    // Fetch global config on mount
    api.get('/config/personalizacao')
      .then(res => setConfig(res.data))
      .catch(err => console.error('Failed to load config:', err))

    if (token) {
      Promise.all([
        authService.getMe(),
        authService.getMyPermissions().catch(() => [])
      ])
        .then(([user, permissions]) => {
          setAuth(user, token, permissions)
        })
        .catch(() => {
          logout()
        })
    }
  }, [token, setAuth, logout, setConfig])

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
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/negocios" element={<NegociosPage />} />
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="/importar-leads" element={<ImportarLeadsPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/personalizacao" element={<PersonalizacaoPage />} />
        <Route path="/distribuicao-leads" element={<DistribuicaoLeadsPage />} />
      </Route>

      {/* Fallback 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
