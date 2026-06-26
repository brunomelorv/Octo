import api from './api'

export interface Usuario {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  active: boolean
  must_change_password: boolean
}

export interface CreateUsuarioPayload {
  email: string
  name: string
  password: string
  role: 'admin' | 'user'
}

export interface UpdateUsuarioPayload {
  email?: string
  name?: string
  role?: 'admin' | 'user'
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
