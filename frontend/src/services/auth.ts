import api from './api'
import { useAuthStore } from '../store/authStore'

export const authService = {
  async login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password })
    return response.data
  },

  async getMe() {
    const response = await api.get('/auth/me')
    return response.data
  },

  logout() {
    useAuthStore.getState().logout()
  },
}
