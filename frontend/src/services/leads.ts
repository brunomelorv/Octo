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

  async getConsultantsPerformance() {
    const response = await api.get('/leads/consultants-performance')
    return response.data
  },

  async createLead(data: {
    full_name: string
    phone: string
    email?: string
    city?: string
    campaign_id?: string
    campaign_name?: string
    platform?: string
    consultant_email?: string
  }) {
    const response = await api.post('/leads/', data)
    return response.data
  },

  async updateLead(leadId: number | string, data: Record<string, any>) {
    const response = await api.put(`/leads/${leadId}`, data)
    return response.data
  },

  async deleteLead(leadId: number | string) {
    const response = await api.delete(`/leads/${encodeURIComponent(String(leadId))}`)
    return response.data
  },

  async bulkUpdateLeads(leadIds: (number | string)[], updates: Record<string, any>) {
    const response = await api.post('/leads/bulk-update', { lead_ids: leadIds, updates })
    return response.data
  },

  async bulkDeleteLeads(leadIds: (number | string)[]) {
    const response = await api.post('/leads/bulk-delete', { lead_ids: leadIds })
    return response.data
  },
}

