import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const store = useAuthStore()
  const navigate = useNavigate()

  const logoutWithRedirect = () => {
    store.logout()
    navigate('/login')
  }

  return {
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    setAuth: store.setAuth,
    logout: logoutWithRedirect,
  }
}
