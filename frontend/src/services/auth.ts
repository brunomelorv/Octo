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

  async getMyPermissions() {
    const response = await api.get('/config/my-permissions')
    return response.data
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await api.post('/auth/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    return response.data
  },

  async updateAvatar(base64: string) {
    const response = await api.patch('/auth/me/avatar', {
      avatar_base64: base64
    })
    return response.data
  },

  logout() {
    useAuthStore.getState().logout()
  },
}
