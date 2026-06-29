import api from './api'

export type UserRole = 'master' | 'head' | 'consultor' | 'administrativo'

export interface Usuario {
  id: string
  email: string
  name: string
  role: UserRole
  active: boolean
  must_change_password: boolean
  avatar_base64?: string | null
}

export interface CreateUsuarioPayload {
  email: string
  name: string
  password: string
  role: UserRole
}

export interface UpdateUsuarioPayload {
  email?: string
  name?: string
  role?: UserRole
  password?: string
  active?: boolean
  must_change_password?: boolean
}

export const usuariosService = {
  async list(): Promise<Usuario[]> {
    const response = await api.get('/auth/users')
    return response.data
  },

  async create(data: CreateUsuarioPayload): Promise<Usuario> {
    const response = await api.post('/auth/users', data)
    return response.data
  },

  async update(id: string, data: UpdateUsuarioPayload): Promise<Usuario> {
    const response = await api.patch(`/auth/users/${id}`, data)
    return response.data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/auth/users/${id}`)
  },
}
