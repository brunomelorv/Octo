import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token && token !== 'session-active') {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 ||
      (error.response?.status === 403 &&
        error.response?.data?.detail?.includes('desativada'))
    ) {
      // Don't redirect if we're already on the login page or this IS the login request
      const isLoginRequest = error.config?.url?.includes('/auth/login')
      const isAlreadyOnLoginPage = window.location.pathname === '/login'
      if (!isLoginRequest) {
        useAuthStore.getState().logout()
        if (!isAlreadyOnLoginPage) {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
