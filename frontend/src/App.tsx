import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { authService } from './services/auth'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LeadsPage from './pages/LeadsPage'
import CampanhasPage from './pages/CampanhasPage'
import NegociosPage from './pages/NegociosPage'
import NotFoundPage from './pages/NotFoundPage'

function RootRedirect() {
  const token = useAuthStore((state) => state.token)
  return token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
}

export default function App() {
  const token = useAuthStore((state) => state.token)
  const setAuth = useAuthStore((state) => state.setAuth)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    if (token) {
      authService.getMe()
        .then((user) => {
          setAuth(user, token)
        })
        .catch(() => {
          logout()
        })
    }
  }, [token, setAuth, logout])

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
        <Route path="/campanhas" element={<CampanhasPage />} />
        <Route path="/negocios" element={<NegociosPage />} />
      </Route>

      {/* Fallback 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
