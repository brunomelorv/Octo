import api from './api'

export interface CampanhasResponse {
  campaign_id: string
  campaign_name: string
  platform: string
  total_leads: number
  total_chamadas: number
}

export const campanhasService = {
  async getCampanhas(): Promise<CampanhasResponse[]> {
    const response = await api.get('/campanhas/')
    return response.data
  },
}
