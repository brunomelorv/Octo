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
  usuario_email?: string | null
  usuario_nome?: string | null
}

export const negociosService = {
  async getNegocios(params?: { campaign_id?: string; search?: string }): Promise<Negocio[]> {
    const response = await api.get('/negocios/', { params })
    return response.data
  },

  async updateNegocio(leadId: string, data: { etapa: string; valor: number; loss_reason?: string | null; loss_comment?: string | null }): Promise<any> {
    const response = await api.put(`/negocios/${leadId}`, data)
    return response.data
  },

  async getNegociosHistorico(): Promise<any[]> {
    const response = await api.get('/negocios/historico')
    return response.data
  },
}
