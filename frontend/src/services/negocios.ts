import api from './api'

export interface Negocio {
  id: string
  full_name: string
  phone: string
  email?: string
  city?: string
  campaign_name?: string
  platform?: string
  created_time: string
  etapa: string
  valor: number
  updated_at?: string
  status_chamada: string
}

export const negociosService = {
  async getNegocios(params?: { campaign_id?: string; search?: string }): Promise<Negocio[]> {
    const response = await api.get('/negocios/', { params })
    return response.data
  },

  async updateNegocio(leadId: string, data: { etapa: string; valor: number }): Promise<any> {
    const response = await api.put(`/negocios/${leadId}`, data)
    return response.data
  },
}
