import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import type { ReactNode } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = useAuthStore((state) => state.token)
  const permissions = useAuthStore((state) => state.permissions)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  const path = location.pathname.split('/')[1]
  const pageId = path ? path.replace('-', '_') : ''

  if (permissions && permissions.length > 0 && pageId && pageId !== 'login') {
    if (!permissions.includes(pageId)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return <>{children}</>
}
