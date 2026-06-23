export interface Lead {
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
    semContatoEfetivo: number
    pediuLigarDepois: number
    avaliandoInternamente: number
    aguardandoRetorno: number
    semInteresseDesq: number
    qualificadoSemAgenda: number
    agendouReuniao: number
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
  }
  duracao: {
    media: string
    mediana: string
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

// Helper to calculate median
function getMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  if (sorted.length % 2 !== 0) return sorted[half]
  return (sorted[half - 1] + sorted[half]) / 2.0
}

// Function to aggregate data based on filtered leads and calls
export function aggregateData(leads: Lead[], calls: Call[]): AggregatedDashboardData {
  let totalLeads = 0
  let contatos = 0
  
  const platformDetails: Record<string, PlatformStats> = {}
  const regionCounts: Record<string, RegionStats> = {}
  const campaignsDetails: Record<string, CampaignStats> = {}
  const leadsByDay: Record<string, number> = {}
  const durations: number[] = []
  
  const scoreCounts: Record<string, number> = {
    '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0
  }

  const funnel = {
    total: 0,
    semLigacao: 0,
    caixaPostal: 0,
    ligacaoCurta: 0,
    semContatoEfetivo: 0,
    pediuLigarDepois: 0,
    avaliandoInternamente: 0,
    aguardandoRetorno: 0,
    semInteresseDesq: 0,
    qualificadoSemAgenda: 0,
    agendouReuniao: 0
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
    qualificadoAgendou: 0
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

    const retorno = lead['houve retornow']
    if (retorno === 'Positivo') contatos++

    const classif = lead['Chamada - Classificação']
    const subcat = lead['Chamada - Subcategoria do Motivo']
    const dur = lead['Chamada - Duração (segundos)']
    const score = lead['Chamada - Qualidade (Score)']

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

    const isSemLigacao = classif === 'Sem Ligação' || retorno === 'Negativo'

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

    funnel.total++
    if (isSemLigacao) {
      funnel.semLigacao++
    } else {
      if (classif === 'Caixa Postal / Não Atendido') funnel.caixaPostal++
      if (subcat === 'Ligação Curta / Sem Diálogo') funnel.ligacaoCurta++
      if (classif === 'Sem Contato Efetivo') funnel.semContatoEfetivo++
      if (subcat === 'Pediu para Ligar Depois') funnel.pediuLigarDepois++
      if (subcat === 'Avaliando Internamente') funnel.avaliandoInternamente++
      if (subcat === 'Aguardando Retorno do Lead') funnel.aguardandoRetorno++

      const isSemInteresseDesq =
        classif === 'Sem Interesse' ||
        classif === 'Lead Desqualificado' ||
        subcat === 'Recusa Direta / Sem Interesse' ||
        subcat === 'Fora do Perfil de Cliente Ideal'
      if (isSemInteresseDesq) funnel.semInteresseDesq++

      if (classif === 'Lead Qualificado') funnel.qualificadoSemAgenda++
      if (classif === 'Agendou Reunião') funnel.agendouReuniao++
    }

    // Motivos counts
    if (isSemLigacao) {
      motivos.semLigacao++
    } else {
      if (classif === 'Caixa Postal / Não Atendido') motivos.caixaPostal++
      if (subcat === 'Ligação Curta / Sem Diálogo') motivos.ligacaoCurta++
      if (subcat === 'Pediu para Ligar Depois') motivos.pediuLigarDepois++
      if (subcat === 'Avaliando Internamente') motivos.avaliandoInternamente++
      if (subcat === 'Recusa Direta / Sem Interesse') motivos.recusaDireta++
      if (subcat === 'Fora do Perfil de Cliente Ideal') motivos.foraPerfil++
      if (subcat === 'Lead Hostil / Irritado') motivos.leadHostil++
      if (classif === 'Lead Qualificado' || classif === 'Agendou Reunião') {
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
    scores: scoreCounts,
    leadsPorDia: leadsByDay,
    ligacoesPorDia: callsByDay,
    ligacoesQuentes: hotCalls,
    statusLigacoes: statusCounts
  }
}
