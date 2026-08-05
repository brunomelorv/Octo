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
  call_anotacoes?: string
  usuario_email?: string | null
  usuario_nome?: string | null
  tags?: string | null
}

export const negociosService = {
  async getNegocios(params?: { campaign_id?: string; search?: string; consultant?: string }): Promise<Negocio[]> {
    const response = await api.get('/negocios/', { params })
    return response.data
  },

  async updateNegocio(leadId: string, data: { etapa: string; valor: number; loss_reason?: string | null; loss_comment?: string | null; tags?: string | null }): Promise<any> {
    const response = await api.put(`/negocios/${leadId}`, data)
    return response.data
  },

  async getNegociosHistorico(dateStart?: string, dateEnd?: string): Promise<any[]> {
    const params: Record<string, string> = {}
    if (dateStart) params.date_start = dateStart
    if (dateEnd) params.date_end = dateEnd
    const response = await api.get('/negocios/historico', { params })
    return response.data
  },

  async getKanbanStats(params?: {
    date_start?: string
    date_end?: string
    consultant_email?: string
  }): Promise<KanbanStats> {
    const response = await api.get('/negocios/kanban-stats', { params })
    return response.data
  },

  /**
   * Downloads the Performance summary as an .xlsx workbook.
   * Returns the blob plus the filename advertised by the server.
   */
  async exportPerformance(params?: {
    date_start?: string
    date_end?: string
    consultant_email?: string
    period_label?: string
  }): Promise<{ blob: Blob; filename: string }> {
    const response = await api.get('/negocios/export-performance', {
      params,
      responseType: 'blob',
    })

    const disposition = response.headers?.['content-disposition'] as string | undefined
    let filename = 'performance_comercial.xlsx'
    if (disposition) {
      // Prefer the RFC 5987 form so accented names survive, then fall back to plain filename.
      const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
      const plain = /filename="?([^";]+)"?/i.exec(disposition)
      if (utf8?.[1]) filename = decodeURIComponent(utf8[1].trim())
      else if (plain?.[1]) filename = plain[1].trim()
    }

    return { blob: response.data as Blob, filename }
  },
}

export interface KanbanStageStat {
  etapa: string
  /** Deals currently sitting in this column (snapshot — not affected by the date filter). */
  current: number
  valor: number
  share: number
  /** Deals that moved INTO this column during the selected window. */
  entered: number
  entered_leads: number
  unknown_stage?: boolean
}

export interface KanbanStats {
  stages: KanbanStageStat[]
  summary: {
    total_deals: number
    total_valor: number
    em_andamento: number
    ganhos: number
    ganhos_valor: number
    perdidos: number
    win_rate: number
  }
}
