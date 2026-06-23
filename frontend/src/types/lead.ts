export interface Lead {
  id: string
  created_time: string
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  form_id?: string
  form_name?: string
  is_organic?: number
  platform?: string
  full_name: string
  phone: string
  city?: string
  email?: string
  lead_status?: string
  source_file?: string
  
  // Enriched fields from calls join
  status_chamada: string
  subcategoria_motivo?: string | null
  score_qualidade?: number | null
  call_date?: string | null
  call_duration?: number | null
  call_summary?: string | null
  call_recording?: string | null
  reuniao_agendada?: string | null
}

export interface Call {
  id: number
  nome_contato?: string
  telefone?: string
  telefone_normalizado: string
  data_hora: string
  duracao_segundos: number
  resumo_ligacao?: string
  status_ligacao?: string
  link_gravacao?: string
  reuniao_agendada?: string
  link_reuniao?: string
  anotacoes?: string
  tag?: string
  source_file?: string
}

export interface LeadWithCalls extends Lead {
  chamadas: Call[]
}
