import { create } from 'zustand'

export interface User {
  id: string
  email: string
  name: string
  role: string
  must_change_password: boolean
  avatar_base64?: string | null
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  permissions: string[]
  setAuth: (user: User, token: string, permissions?: string[]) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  permissions: [],
  setAuth: (user, token, permissions = []) => {
    localStorage.setItem('token', token)
    set({ user, token, isAuthenticated: true, permissions })
  },
  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null, isAuthenticated: false, permissions: [] })
  },
}))
