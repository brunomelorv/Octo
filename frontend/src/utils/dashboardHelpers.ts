export interface Lead {
  Nome?: string | null
  Campanha: string
  Plataforma: string
  Região: string
  'Data de Criação': string
  'houve retornow': string
  'Chamada - Classificação': string
  'Chamada - Subcategoria do Motivo': string
  'Chamada - Duração (segundos)': number | null
  'Chamada - Qualidade (Score)': number | null
  phone: string
}

export interface Call {
  'Nome do Contato': string
  'Número de Telefone': string
  'Tel Meta': string
  whatsapp_link: string
  'Data e Hora': string
  iso_date: string
  'Duração (segundos)': number
  'Classificação da Chamada': string
  'Qualidade do Lead (Score)': number | null
  'Resumo da Conversa (IA)': string
  'Link da Gravação': string
  'Status Original da Ligação': string
  tag: string
}

export interface HotCall {
  nome: string
  telefone: string
  whatsapp_link: string
  data_hora: string
  iso_date: string
  duracao: number | null
  classificacao: string
  score: number | null
  resumo: string
  link_gravacao: string
}

export interface PlatformStats {
  total: number
  semLigacao: number
  agendouReuniao: number
}

export interface CampaignStats {
  total: number
  semLigacao: number
  agendouReuniao: number
}

export interface RegionStats {
  total: number
  semLigacao: number
  agendouReuniao: number
}

export interface AggregatedDashboardData {
  totalLeads: number
  contatos: number
  agendados: number
  leadsPorPlataforma: Record<string, PlatformStats>
  leadsPorRegiao: Record<string, RegionStats>
  leadsPorCampanha: Record<string, CampaignStats>
  funnel: {
    total: number
    semLigacao: number
    caixaPostal: number
    ligacaoCurta: number
    pediuLigarDepois: number
    avaliandoInternamente: number
    aguardandoRetorno: number
    semInteresseDesq: number
    qualificadoSemAgenda: number
    agendouReuniao: number
    inconclusivo: number
  }
  motivos: {
    semLigacao: number
    caixaPostal: number
    ligacaoCurta: number
    pediuLigarDepois: number
    avaliandoInternamente: number
    recusaDireta: number
    foraPerfil: number
    leadHostil: number
    qualificadoAgendou: number
    inconclusivo: number
  }
  duracao: {
    media: string
    mediana: string
  }
  leadTime: {
    media: string
    mediana: string
    totalLeadsComChamada: number
  }
  scores: Record<string, number>
  leadsPorDia: Record<string, number>
  ligacoesPorDia: Record<string, number>
  ligacoesQuentes: HotCall[]
  statusLigacoes: Record<string, number>
}


// Helper to format duration in string
export function formatDuration(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Helper to format lead time (larger durations: hours/days)
export function formatLeadTime(seconds: number): string {
  if (seconds <= 0) return '0h'
  const minutes = seconds / 60
  const hours = minutes / 60
  const days = hours / 24
  if (days >= 1) {
    const remainingHours = Math.floor(hours % 24)
    if (remainingHours > 0) return `${Math.floor(days)}d ${remainingHours}h`
    return `${Math.floor(days)}d`
  }
  if (hours >= 1) {
    const remainingMin = Math.floor(minutes % 60)
    if (remainingMin > 0) return `${Math.floor(hours)}h ${remainingMin}min`
    return `${Math.floor(hours)}h`
  }
  return `${Math.floor(minutes)}min`
}

// Helper to calculate median
function getMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  if (sorted.length % 2 !== 0) return sorted[half]
  return (sorted[half - 1] + sorted[half]) / 2.0
}

// Function to aggregate data based on filtered leads and calls
// SOURCE OF TRUTH: all data comes exclusively from drag-and-drop uploaded files
// (leads_facebook/*.csv and chamadas_pitchyes/*.xlsx) processed by build_database.py.
// No Excel data from Windows folders or legacy sources is used.
export function aggregateData(leads: Lead[], calls: Call[]): AggregatedDashboardData {
  let totalLeads = 0
  let contatos = 0
  
  const platformDetails: Record<string, PlatformStats> = {}
  const regionCounts: Record<string, RegionStats> = {}
  const campaignsDetails: Record<string, CampaignStats> = {}
  const leadsByDay: Record<string, number> = {}
  const durations: number[] = []
  const leadTimeDeltas: number[] = [] // seconds between lead creation and first call
  
  const scoreCounts: Record<string, number> = {
    '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0
  }

  // Build a map of phone -> earliest call date for lead time computation
  // Only uses calls from the filtered/drag-and-drop set
  const earliestCallByPhone: Record<string, string> = {}
  calls.forEach((call) => {
    const phone = call['Tel Meta']
    const callDateTime = call['Data e Hora']
    if (phone && callDateTime) {
      if (!earliestCallByPhone[phone] || callDateTime < earliestCallByPhone[phone]) {
        earliestCallByPhone[phone] = callDateTime
      }
    }
  })

  const funnel = {
    total: 0,
    semLigacao: 0,
    caixaPostal: 0,
    ligacaoCurta: 0,
    pediuLigarDepois: 0,
    avaliandoInternamente: 0,
    aguardandoRetorno: 0,
    semInteresseDesq: 0,
    qualificadoSemAgenda: 0,
    agendouReuniao: 0,
    inconclusivo: 0
  }

  const motivos = {
    semLigacao: 0,
    caixaPostal: 0,
    ligacaoCurta: 0,
    pediuLigarDepois: 0,
    avaliandoInternamente: 0,
    recusaDireta: 0,
    foraPerfil: 0,
    leadHostil: 0,
    qualificadoAgendou: 0,
    inconclusivo: 0
  }

  leads.forEach((lead) => {
    totalLeads++
    const camp = lead.Campanha
    if (camp) {
      if (!campaignsDetails[camp]) {
        campaignsDetails[camp] = { total: 0, semLigacao: 0, agendouReuniao: 0 }
      }
      campaignsDetails[camp].total++
    }

    const plat = lead.Plataforma
    if (plat) {
      if (!platformDetails[plat]) {
        platformDetails[plat] = { total: 0, semLigacao: 0, agendouReuniao: 0 }
      }
      platformDetails[plat].total++
    }

    const reg = lead.Região
    if (reg) {
      if (!regionCounts[reg]) {
        regionCounts[reg] = { total: 0, semLigacao: 0, agendouReuniao: 0 }
      }
      regionCounts[reg].total++
    }

    const criaVal = lead['Data de Criação']
    if (criaVal) {
      const dayStr = criaVal.slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
        leadsByDay[dayStr] = (leadsByDay[dayStr] || 0) + 1
      }
    }

    const classif = lead['Chamada - Classificação']
    const subcat = lead['Chamada - Subcategoria do Motivo']
    const dur = lead['Chamada - Duração (segundos)']
    const score = lead['Chamada - Qualidade (Score)']
    const phone = lead.phone

    // SOURCE OF TRUTH: isSemLigacao is ONLY true when the backend classification says
    // "Sem Ligação", meaning the lead phone was NOT found in any drag-and-drop call file.
    // We do NOT use the legacy 'houve retornow' field which conflates multiple categories.
    const isSemLigacao = classif === 'Sem Ligação'

    // "Contato efetivo" = lead had a real conversation (not voicemail, not unanswered call)
    const isContatoEfetivo = !isSemLigacao && classif !== 'Caixa Postal / Não Atendido'
    if (isContatoEfetivo) contatos++

    // Lead time: only for leads whose phone has calls in the filtered (drag-and-drop) set
    if (phone && criaVal && earliestCallByPhone[phone]) {
      try {
        const leadCreatedDate = new Date(criaVal + 'T00:00:00')
        const firstCallDateStr = earliestCallByPhone[phone]
        const normalizedCallDate = firstCallDateStr.replace(' ', 'T')
        const firstCallDate = new Date(normalizedCallDate.includes('T') ? normalizedCallDate : normalizedCallDate + 'T00:00:00')
        if (!isNaN(leadCreatedDate.getTime()) && !isNaN(firstCallDate.getTime()) && firstCallDate >= leadCreatedDate) {
          const deltaSeconds = (firstCallDate.getTime() - leadCreatedDate.getTime()) / 1000
          leadTimeDeltas.push(deltaSeconds)
        }
      } catch {
        // skip leads where dates can't be parsed
      }
    }

    if (dur !== null && dur !== undefined) {
      const durVal = parseFloat(dur as any)
      if (!isNaN(durVal) && durVal > 0) {
        durations.push(durVal)
      }
    }
    if (score !== null && score !== undefined) {
      const sVal = Math.round(parseFloat(score as any))
      if (!isNaN(sVal) && sVal >= 1 && sVal <= 8) {
        scoreCounts[String(sVal)]++
      }
    }

    if (reg) {
      if (isSemLigacao) regionCounts[reg].semLigacao++
      if (classif === 'Agendou Reunião') regionCounts[reg].agendouReuniao++
    }
    if (plat) {
      if (isSemLigacao) platformDetails[plat].semLigacao++
      if (classif === 'Agendou Reunião') platformDetails[plat].agendouReuniao++
    }
    if (camp) {
      if (isSemLigacao) campaignsDetails[camp].semLigacao++
      if (classif === 'Agendou Reunião') campaignsDetails[camp].agendouReuniao++
    }

    // ─── FUNIL (mutually exclusive — each lead falls into exactly ONE bucket) ──
    // Each lead falls into exactly ONE category. Priority: best outcomes first.
    funnel.total++

    if (isSemLigacao) {
      // Lead phone never appeared in any drag-and-drop call file
      funnel.semLigacao++
    } else if (classif === 'Agendou Reunião') {
      funnel.agendouReuniao++
    } else if (classif === 'Retorno Agendado') {
      funnel.aguardandoRetorno++
    } else if (classif === 'Lead Qualificado') {
      funnel.qualificadoSemAgenda++
    } else if (classif === 'Contato Inconclusivo') {
      funnel.inconclusivo++
    } else if (classif === 'Sem Interesse' || classif === 'Lead Desqualificado') {
      funnel.semInteresseDesq++
    } else if (classif === 'Caixa Postal / Não Atendido') {
      if (subcat === 'Ligação Curta / Sem Diálogo') {
        funnel.ligacaoCurta++
      } else {
        funnel.caixaPostal++
      }
    } else if (classif === 'Sem Contato Efetivo') {
      if (subcat === 'Pediu para Ligar Depois') {
        funnel.pediuLigarDepois++
      } else {
        funnel.avaliandoInternamente++
      }
    } else {
      // Catch-all for any other classification that has a call
      funnel.avaliandoInternamente++
    }

    // ─── MOTIVOS (additive — a lead can appear in multiple sub-categories) ────
    if (isSemLigacao) {
      motivos.semLigacao++
    } else {
      if (classif === 'Caixa Postal / Não Atendido' && subcat !== 'Ligação Curta / Sem Diálogo') motivos.caixaPostal++
      if (subcat === 'Ligação Curta / Sem Diálogo') motivos.ligacaoCurta++
      if (subcat === 'Pediu para Ligar Depois') motivos.pediuLigarDepois++
      if (subcat === 'Avaliando Internamente') motivos.avaliandoInternamente++
      if (subcat === 'Recusa Direta / Sem Interesse') motivos.recusaDireta++
      if (subcat === 'Fora do Perfil de Cliente Ideal') motivos.foraPerfil++
      if (subcat === 'Lead Hostil / Irritado') motivos.leadHostil++
      if (classif === 'Contato Inconclusivo') motivos.inconclusivo++
      if (classif === 'Lead Qualificado' || classif === 'Agendou Reunião' || classif === 'Retorno Agendado') {
        motivos.qualificadoAgendou++
      }
    }
  })

  // Process calls
  const callsByDay: Record<string, number> = {}
  const statusCounts: Record<string, number> = {}
  const hotCalls: HotCall[] = []
 
  calls.forEach((call) => {
    const isoDate = call.iso_date
    if (isoDate) {
      callsByDay[isoDate] = (callsByDay[isoDate] || 0) + 1
    }
 
    const status = call['Status Original da Ligação']
    if (status) {
      statusCounts[status] = (statusCounts[status] || 0) + 1
    }
 
    const classification = call['Classificação da Chamada']
    const score = call['Qualidade do Lead (Score)']
 
    let isHot = false
    try {
      if (score !== null && score !== undefined && parseFloat(score as any) >= 5) {
        isHot = true
      }
    } catch {
      // ignore
    }
 
    if (
      classification === 'Agendou Reunião' ||
      classification === 'Lead Qualificado' ||
      classification === 'Retorno Agendado'
    ) {
      isHot = true
    }
 
    if (isHot) {
      hotCalls.push({
        nome: call['Nome do Contato'] || 'Sem Nome',
        telefone: call['Número de Telefone'] || '',
        whatsapp_link: call.whatsapp_link || '',
        data_hora: call['Data e Hora'],
        iso_date: isoDate,
        duracao: call['Duração (segundos)'],
        classificacao: classification || 'Não classificado',
        score: score,
        resumo: call['Resumo da Conversa (IA)'] || 'Sem resumo disponível.',
        link_gravacao: call['Link da Gravação'] || ''
      })
    }
  })
 
  // Sort hot calls by score desc, then by date desc
  hotCalls.sort((a, b) => {
    const scoreA = a.score || 0
    const scoreB = b.score || 0
    if (scoreB !== scoreA) return scoreB - scoreA
    return new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
  })


  const durMediaNum = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  const durMedianaNum = durations.length > 0 ? getMedian(durations) : 0

  // Lead time stats
  const leadTimeMediaNum = leadTimeDeltas.length > 0 ? leadTimeDeltas.reduce((a, b) => a + b, 0) / leadTimeDeltas.length : 0
  const leadTimeMedianaNum = leadTimeDeltas.length > 0 ? getMedian(leadTimeDeltas) : 0

  return {
    totalLeads,
    contatos,
    agendados: funnel.agendouReuniao,
    leadsPorPlataforma: platformDetails,
    leadsPorRegiao: regionCounts,
    leadsPorCampanha: campaignsDetails,
    funnel,
    motivos,
    duracao: {
      media: formatDuration(durMediaNum),
      mediana: formatDuration(durMedianaNum)
    },
    leadTime: {
      media: formatLeadTime(leadTimeMediaNum),
      mediana: formatLeadTime(leadTimeMedianaNum),
      totalLeadsComChamada: leadTimeDeltas.length
    },
    scores: scoreCounts,
    leadsPorDia: leadsByDay,
    ligacoesPorDia: callsByDay,
    ligacoesQuentes: hotCalls,
    statusLigacoes: statusCounts
  }
}
