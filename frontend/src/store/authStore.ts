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
  isChecking: boolean
  setAuth: (user: User, token: string, permissions?: string[]) => void
  logout: () => void
  setChecking: (isChecking: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  permissions: [],
  isChecking: true,
  setAuth: (user, token, permissions = []) => {
    set({ user, token, isAuthenticated: true, permissions, isChecking: false })
  },
  logout: () => {
    set({ user: null, token: null, isAuthenticated: false, permissions: [], isChecking: false })
  },
  setChecking: (isChecking) => set({ isChecking }),
}))
