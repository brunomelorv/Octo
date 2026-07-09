import api from './api'

export interface AgendaItem {
  chamada_id: number;
  event_type: string;
  time?: string;
  deal_stage?: string;
  is_completed?: boolean;
  lead_name: string;
  phone: string;
  resumo: string;
  comments: any[];
  lead_id?: string;
}

export const agendaService = {
  async getAgenda(date: string): Promise<AgendaItem[]> {
    const response = await api.get('/agenda/', { params: { date } })
    return response.data
  },

  async addComment(phone: string, date_str: string, comment: string, user_email: string) {
    const response = await api.post('/agenda/comments', { phone, date_str, comment, user_email })
    return response.data
  },

  async rescheduleItem(phone: string, lead_name: string, new_date_str: string, new_time_str: string, user_email: string, comment?: string) {
    const response = await api.post('/agenda/reschedule', { phone, lead_name, new_date_str, new_time_str, user_email, comment })
    return response.data
  },

  async completeItem(chamada_id: string | number, user_email: string, phone?: string, lead_name?: string, loss_reason?: string, loss_comment?: string, deal_stage?: string) {
    const response = await api.post('/agenda/complete', { 
      chamada_id: Number(chamada_id), user_email, phone, lead_name, loss_reason, loss_comment, deal_stage
    })
    return response.data
  }
}
