import api from './api'

export const leadsService = {
  async getDashboardData() {
    const response = await api.get('/leads/dashboard-data')
    return response.data
  },

  async getKpis() {
    const response = await api.get('/leads/kpis')
    return response.data
  },

  async getLeads(params?: {
    status?: string
    campanha_id?: string
    search?: string
    consultant?: string
    page?: number
    page_size?: number
  }) {
    const response = await api.get('/leads/', { params })
    return response.data
  },

  async getLeadByPhone(phone: string) {
    const response = await api.get(`/leads/${phone}`)
    return response.data
  },
}
