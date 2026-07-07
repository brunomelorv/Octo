import { useState, useEffect, useMemo } from 'react'
import { leadsService } from '../services/leads'
import DOMPurify from 'dompurify'
import api from '../services/api'
import { aggregateData, formatDuration } from '../utils/dashboardHelpers'
import type {
  AggregatedDashboardData,
  Call,
  Lead,
} from '../utils/dashboardHelpers'
import { useAuthStore } from '../store/authStore'
import {
  BarChart3,
  PhoneOff,
  PhoneCall,
  Calendar,
  Search,
  MessageSquare,
  Award,
  Target,
  Play,
  Clock,
  Info,
  Sparkles
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

// Register ChartJS plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// Tooltip component for KPI cards
function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center ml-1">
      <Info className="w-3 h-3 text-[var(--text-tertiary)] stroke-[1.5] cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg p-2.5 text-[11px] text-[var(--text-secondary)] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-normal text-left">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--border)]"></div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Raw data from server
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [allCalls, setAllCalls] = useState<Call[]>([])
  const [campaignList, setCampaignList] = useState<string[]>([])

  // Active filters
  const [activeTab, setActiveTab] = useState<'geral' | 'nao-atenderam' | 'analise-ligacoes' | 'insights'>('geral')
  const { user: currentUser } = useAuthStore()
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [customDateStart, setCustomDateStart] = useState<string>('')
  const [customDateEnd, setCustomDateEnd] = useState<string>('')

  // Search & filter state for hot calls table
  const [hotSearchQuery, setHotSearchQuery] = useState('')
  const [hotFilterClassification, setHotFilterClassification] = useState('')
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [modalSearchQuery, setModalSearchQuery] = useState('')

  // Campaign Insights State
  const [insights, setInsights] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)

  const isAuthorizedToGenerate = useMemo(() => {
    return currentUser?.role === 'master' || currentUser?.role === 'head'
  }, [currentUser])

  const handleGenerateInsights = async () => {
    if (!isAuthorizedToGenerate) return
    setIsGeneratingInsights(true)
    setInsightError(null)
    try {
      const response = await api.post('/leads/campaign-insights', {
        totalLeads: dashboardData.totalLeads,
        contatos: dashboardData.contatos,
        agendados: dashboardData.agendados,
        leadsPorCampanha: dashboardData.leadsPorCampanha,
        leadsPorPlataforma: dashboardData.leadsPorPlataforma,
        motivos: dashboardData.motivos,
      })
      setInsights(response.data.insights)
      setGeneratedAt(response.data.generated_at)
    } catch (err: any) {
      console.error('Failed to generate insights:', err)
      const msg = err.response?.data?.detail || 'Erro ao comunicar com o servidor'
      setInsightError(msg)
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  // Load data on mount
  useEffect(() => {
    Promise.all([
      leadsService.getDashboardData(),
      api.get('/leads/campaign-insights').catch((err) => {
        console.warn('Failed to load saved insights:', err)
        return { data: { insights: null, generated_at: null } }
      })
    ])
      .then(([dashboardRes, insightsRes]) => {
        setAllLeads(dashboardRes.allLeads || [])
        setAllCalls(dashboardRes.allCalls || [])
        setCampaignList(dashboardRes.campaigns || [])
        if (insightsRes.data) {
          setInsights(insightsRes.data.insights || null)
          setGeneratedAt(insightsRes.data.generated_at || null)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load dashboard data:', err)
        setError('Erro ao carregar dados do banco de dados. Certifique-se de que a API está rodando e as tabelas estão populadas.')
        setLoading(false)
      })
  }, [])

  // 1. Calculate Reference Date (maximum date in dataset)
  const referenceDate = useMemo(() => {
    let maxDateStr: string | null = null
    allLeads.forEach((l) => {
      const d = l['Data de Criação']
      if (d && (!maxDateStr || d > maxDateStr)) maxDateStr = d
    })
    allCalls.forEach((c) => {
      const d = c.iso_date
      if (d && (!maxDateStr || d > maxDateStr)) maxDateStr = d
    })

    const refDate = new Date()
    if (maxDateStr) {
      const dateStr: string = maxDateStr
      const maxDatasetDate = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00')
      if (refDate.getTime() - maxDatasetDate.getTime() > 30 * 24 * 60 * 60 * 1000) {
        return maxDatasetDate
      }
    }
    return refDate
  }, [allLeads, allCalls])

  // 2. Calculate Date Range bounds based on filter selection
  const dateRangeBounds = useMemo(() => {
    if (dateFilter === 'all') return null

    const start = new Date(referenceDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(referenceDate)
    end.setHours(23, 59, 59, 999)

    if (dateFilter === 'hoje') {
      return { start, end }
    }
    if (dateFilter === 'ontem') {
      start.setDate(start.getDate() - 1)
      end.setDate(end.getDate() - 1)
      return { start, end }
    }
    if (dateFilter === 'essa_semana') {
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      start.setDate(diff)
      return { start, end }
    }
    if (dateFilter === 'semana_passada') {
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1) - 7
      start.setDate(diff)
      const endOfWeek = new Date(start)
      endOfWeek.setDate(start.getDate() + 6)
      endOfWeek.setHours(23, 59, 59, 999)
      return { start, end: endOfWeek }
    }
    if (dateFilter === 'semana_retrasada') {
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1) - 14
      start.setDate(diff)
      const endOfWeek = new Date(start)
      endOfWeek.setDate(start.getDate() + 6)
      endOfWeek.setHours(23, 59, 59, 999)
      return { start, end: endOfWeek }
    }
    if (dateFilter === 'esse_mes') {
      start.setDate(1)
      return { start, end }
    }
    if (dateFilter === 'personalizado' && customDateStart && customDateEnd) {
      const s = new Date(customDateStart + 'T00:00:00')
      const e = new Date(customDateEnd + 'T23:59:59.999')
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s <= e) {
        return { start: s, end: e }
      }
    }

    return null
  }, [dateFilter, referenceDate, customDateStart, customDateEnd])

  // 3. Filter leads & calls locally
  const filteredLeads = useMemo(() => {
    let result = allLeads

    if (selectedCampaign !== 'all') {
      result = result.filter((l) => l.Campanha === selectedCampaign)
    }

    if (dateRangeBounds) {
      result = result.filter((l) => {
        const d = l['Data de Criação']
        if (!d) return false
        const leadDate = new Date(d.includes('T') ? d : d + 'T12:00:00')
        return leadDate >= dateRangeBounds.start && leadDate <= dateRangeBounds.end
      })
    }

    return result
  }, [allLeads, selectedCampaign, dateRangeBounds])

  const filteredCalls = useMemo(() => {
    let result = allCalls

    if (selectedCampaign !== 'all') {
      result = result.filter((c) => {
        const lead = allLeads.find((l) => l.phone === c['Tel Meta'])
        return lead ? lead.Campanha === selectedCampaign : c.tag === selectedCampaign
      })
    }

    if (dateRangeBounds) {
      result = result.filter((c) => {
        const d = c.iso_date
        if (!d) return false
        const callDate = new Date(d + 'T12:00:00')
        return callDate >= dateRangeBounds.start && callDate <= dateRangeBounds.end
      })
    }

    return result
  }, [allCalls, allLeads, selectedCampaign, dateRangeBounds])

  // 4. Aggregate dashboard data based on filtered rows
  const dashboardData: AggregatedDashboardData = useMemo(() => {
    return aggregateData(filteredLeads, filteredCalls)
  }, [filteredLeads, filteredCalls])

  // 5. Filter hot calls locally (search and classification select)
  const filteredHotCalls = useMemo(() => {
    return dashboardData.ligacoesQuentes.filter((c) => {
      if (hotFilterClassification) {
        if (hotFilterClassification === 'Outros') {
          if (c.classificacao === 'Agendou Reunião' || c.classificacao === 'Lead Qualificado' || c.classificacao === 'Retorno Agendado') {
            return false
          }
        } else if (c.classificacao !== hotFilterClassification) {
          return false
        }
      }

      const query = hotSearchQuery.toLowerCase().trim()
      if (query) {
        const nameMatch = (c.nome || '').toLowerCase().includes(query)
        const summaryMatch = (c.resumo || '').toLowerCase().includes(query)
        return nameMatch || summaryMatch
      }

      return true
    })
  }, [dashboardData, hotSearchQuery, hotFilterClassification])

  // Conversion rates calculations
  const contactRate = useMemo(() => {
    if (dashboardData.totalLeads === 0) return 0
    return Math.round((dashboardData.contatos / dashboardData.totalLeads) * 100)
  }, [dashboardData])

  const meetingRate = useMemo(() => {
    if (dashboardData.contatos === 0) return 0
    return Math.round((dashboardData.agendados / dashboardData.contatos) * 100)
  }, [dashboardData])

  const wasteRate = useMemo(() => {
    if (dashboardData.totalLeads === 0) return 0
    const uselessLeads = dashboardData.totalLeads - dashboardData.contatos
    return Math.round((uselessLeads / dashboardData.totalLeads) * 100)
  }, [dashboardData])

  const leadsInSelectedBucket = useMemo(() => {
    if (!selectedBucket) return []
    return filteredLeads.filter((lead) => {
      const classif = lead['Chamada - Classificação']
      const subcat = lead['Chamada - Subcategoria do Motivo']
      const isSemLigacao = classif === 'Sem Ligação'

      switch (selectedBucket) {
        case 'total':
          return true
        case 'semLigacao':
          return isSemLigacao
        case 'agendouReuniao':
          return !isSemLigacao && classif === 'Agendou Reunião'
        case 'aguardandoRetorno':
          return !isSemLigacao && classif === 'Retorno Agendado'
        case 'qualificadoSemAgenda':
          return !isSemLigacao && classif === 'Lead Qualificado'
        case 'inconclusivo':
          return !isSemLigacao && classif === 'Contato Inconclusivo'
        case 'semInteresseDesq':
          return !isSemLigacao && (classif === 'Sem Interesse' || classif === 'Lead Desqualificado')
        case 'ligacaoCurta':
          return !isSemLigacao && classif === 'Caixa Postal / Não Atendido' && subcat === 'Ligação Curta / Sem Diálogo'
        case 'caixaPostal':
          return !isSemLigacao && classif === 'Caixa Postal / Não Atendido' && subcat !== 'Ligação Curta / Sem Diálogo'
        case 'pediuLigarDepois':
          return !isSemLigacao && classif === 'Sem Contato Efetivo' && subcat === 'Pediu para Ligar Depois'
        case 'avaliandoInternamente':
          if (isSemLigacao) return false
          if (classif === 'Sem Contato Efetivo' && subcat !== 'Pediu para Ligar Depois') return true
          const knownClassifs = [
            'Agendou Reunião', 'Retorno Agendado', 'Lead Qualificado', 'Contato Inconclusivo',
            'Sem Interesse', 'Lead Desqualificado', 'Caixa Postal / Não Atendido'
          ]
          return !knownClassifs.includes(classif)
        default:
          return false
      }
    })
  }, [filteredLeads, selectedBucket])

  const searchedModalLeads = useMemo(() => {
    const query = modalSearchQuery.toLowerCase().trim()
    if (!query) return leadsInSelectedBucket
    return leadsInSelectedBucket.filter((l) => {
      const nameMatch = (l.Nome || '').toLowerCase().includes(query)
      const phoneMatch = (l.phone || '').toLowerCase().includes(query)
      const campMatch = (l.Campanha || '').toLowerCase().includes(query)
      return nameMatch || phoneMatch || campMatch
    })
  }, [leadsInSelectedBucket, modalSearchQuery])

  // Chart setup
  const isDark = document.documentElement.classList.contains('dark')

  const campaignsChartData = useMemo(() => {
    const campaigns = Object.entries(dashboardData.leadsPorCampanha)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10) // Top 10 campaigns
    
    return {
      labels: campaigns.map(c => c[0].length > 20 ? c[0].substring(0, 20) + '...' : c[0]),
      datasets: [
        {
          label: 'Leads',
          data: campaigns.map(c => c[1].total),
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 0.7)',
          borderRadius: 4,
        },
        {
          label: 'Agendados',
          data: campaigns.map(c => c[1].agendouReuniao),
          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.7)',
          borderRadius: 4,
        }
      ]
    }
  }, [dashboardData.leadsPorCampanha, isDark])

  const leadsVsCallsChartData = useMemo(() => {
    const allDates = new Set<string>()
    Object.keys(dashboardData.leadsPorDia).forEach((d) => allDates.add(d))
    Object.keys(dashboardData.ligacoesPorDia).forEach((d) => allDates.add(d))

    const sortedDates = Array.from(allDates).sort()

    const labels = sortedDates.map((d) => {
      const parts = d.split('-')
      if (parts.length === 3) return `${parts[2]}/${parts[1]}`
      return d
    })

    const leadsSeries = sortedDates.map((d) => dashboardData.leadsPorDia[d] || 0)
    const callsSeries = sortedDates.map((d) => dashboardData.ligacoesPorDia[d] || 0)

    return {
      labels,
      datasets: [
        {
          label: 'Leads Recebidos',
          data: leadsSeries,
          borderColor: isDark ? '#818cf8' : '#4f46e5',
          backgroundColor: isDark ? 'rgba(129, 140, 248, 0.1)' : 'rgba(79, 70, 229, 0.05)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: isDark ? '#818cf8' : '#4f46e5',
          tension: 0.15,
          fill: true,
        },
        {
          label: 'Ligações Realizadas',
          data: callsSeries,
          borderColor: isDark ? '#f97316' : '#ea580c',
          backgroundColor: isDark ? 'rgba(249, 115, 22, 0.05)' : 'rgba(234, 88, 12, 0.03)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: isDark ? '#f97316' : '#ea580c',
          tension: 0.15,
          fill: true,
        },
      ],
    }
  }, [dashboardData])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#6b7280',
          font: { family: 'Inter', size: 11 },
        },
      },
      tooltip: {
        padding: 8,
        titleFont: { family: 'Inter', size: 12, weight: 'bold' as const },
        bodyFont: { family: 'Inter', size: 11 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } },
      },
      y: {
        grid: { color: 'rgba(156, 163, 175, 0.08)' },
        ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } },
      },
    },
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
        <span className="text-xs text-[var(--text-secondary)]">Carregando painel de estatísticas...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] p-6 rounded-lg text-center max-w-xl mx-auto transition-colors duration-150">
        <p className="text-red-500 font-semibold text-sm mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium rounded-md transition-colors duration-150"
        >
          Recarregar Página
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 transition-colors duration-150">
      {/* Top Header */}
      <div>
        <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">Marketing Geral</h1>
        <p className="text-xs text-[var(--text-secondary)]">
          Métricas consolidadas de captação de leads e conversão do SDR por voz.
        </p>
      </div>

      {/* FILTERS CONTROL PANEL */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 transition-colors duration-150">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          {/* Campaign Select */}
          <div className="flex-1 max-w-md space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 stroke-[1.5]" />
              Campanha de Marketing
            </span>
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="w-full h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
            >
              <option value="all">Todas as Campanhas</option>
              {campaignList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Date Picker Button Group */}
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 stroke-[1.5]" />
              Filtrar por Período
            </span>
            <div className="flex flex-wrap gap-1 items-center">
              {[
                { label: 'Tudo', value: 'all' },
                { label: 'Hoje', value: 'hoje' },
                { label: 'Ontem', value: 'ontem' },
                { label: 'Esta Semana', value: 'essa_semana' },
                { label: 'Semana Passada', value: 'semana_passada' },
                { label: 'Semana Retrasada', value: 'semana_retrasada' },
                { label: 'Este Mês', value: 'esse_mes' },
                { label: 'Personalizado', value: 'personalizado' },
              ].map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => setDateFilter(btn.value)}
                  className={`text-xs h-7 px-3 rounded-full border transition-colors duration-150 ${
                    dateFilter === btn.value
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-fg)]'
                      : 'bg-transparent border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
              {dateFilter === 'personalizado' && (
                <div className="flex items-center gap-1.5 ml-1">
                  <input
                    type="date"
                    value={customDateStart}
                    onChange={(e) => setCustomDateStart(e.target.value)}
                    className="h-7 px-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                  <span className="text-xs text-[var(--text-secondary)]">até</span>
                  <input
                    type="date"
                    value={customDateEnd}
                    onChange={(e) => setCustomDateEnd(e.target.value)}
                    className="h-7 px-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex border-b border-[var(--border)] overflow-x-auto whitespace-nowrap">
        {[
          { id: 'geral', label: 'Análise Marketing Geral', icon: <BarChart3 className="w-4 h-4 stroke-[1.5]" /> },
          { id: 'nao-atenderam', label: 'Análise PitchYES', icon: <PhoneOff className="w-4 h-4 stroke-[1.5]" /> },
          { id: 'analise-ligacoes', label: 'Análise de Ligações', icon: <PhoneCall className="w-4 h-4 stroke-[1.5]" /> },
          { id: 'insights', label: 'Chamado Insight', icon: <Sparkles className="w-4 h-4 stroke-[1.5]" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-sm transition-colors duration-150 -mb-px ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--text-primary)] font-semibold'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB PANELS */}

      {/* TAB 1: Marketing Geral */}
      {activeTab === 'geral' && (
        <div className="space-y-4">
          {/* General KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Leads Totais
                <InfoTooltip text="Total de leads cadastrados via Facebook/Instagram Ads. Fonte: arquivos CSV do drag-and-drop (pasta leads_facebook). Deduplica por ID de lead." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.totalLeads}</span>
                <span className="text-xs text-[var(--text-secondary)]">cadastros</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Facebook &amp; Instagram Ads</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Taxa de Contato Efetivo
                <InfoTooltip text="% de leads que tiveram uma conversa real com o SDR. Exclui caixa postal e não-atendidos. Cálculo: Leads com classificação diferente de 'Sem Ligação' e 'Caixa Postal / Não Atendido' ÷ Total de Leads × 100." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{contactRate}%</span>
                <span className="text-xs text-[var(--text-secondary)]">({dashboardData.contatos} leads)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Diálogo efetivo com o SDR IA</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Reuniões e Retornos
                <InfoTooltip text="Soma de leads classificados como 'Agendou Reunião' + leads com 'Retorno Agendado'. Fonte: arquivos de chamadas do drag-and-drop (pasta chamadas_pitchyes). Baseado na classificação automática do resumo da IA." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {dashboardData.agendados + (dashboardData.funnel.aguardandoRetorno || 0)}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({dashboardData.agendados} agendados | {dashboardData.funnel.aguardandoRetorno || 0} retornos)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Reuniões agendadas &amp; pedidos de retorno</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                Lead Time Médio
                <InfoTooltip text="Tempo médio (e mediana) entre a criação do lead na Meta e a 1ª ligação registrada nos arquivos de chamadas. Calculado apenas para leads que aparecem em ambas as fontes (drag-and-drop)." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.leadTime.media}</span>
                <span className="text-xs text-[var(--text-secondary)]">(mediana: {dashboardData.leadTime.mediana})</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Tempo até 1º atendimento ({dashboardData.leadTime.totalLeadsComChamada} leads)</p>
            </div>
          </div>

          {/* Centered Funnel section */}
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-lg space-y-4 transition-colors duration-150">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
              Funil de Vendas SDR (Ligação)
            </h3>
            
            <div className="space-y-1.5">
              {[
                { label: 'Total de Leads Captados', val: dashboardData.funnel.total, color: 'bg-slate-500', key: 'total' },
                { label: 'Sem Ligação (nunca discados)', val: dashboardData.funnel.semLigacao, color: 'bg-slate-400', key: 'semLigacao' },
                { label: 'Caixa Postal / Não Atendido', val: dashboardData.funnel.caixaPostal, color: 'bg-amber-500', key: 'caixaPostal' },
                { label: 'Ligação Curta / Sem Diálogo (< 15s)', val: dashboardData.funnel.ligacaoCurta, color: 'bg-red-450', key: 'ligacaoCurta' },
                { label: 'Contato Inconclusivo (≥ 30s sem classif)', val: dashboardData.funnel.inconclusivo, color: 'bg-purple-400', key: 'inconclusivo' },
                { label: 'Pediu para Ligar Depois / Retorno', val: dashboardData.funnel.pediuLigarDepois, color: 'bg-yellow-500', key: 'pediuLigarDepois' },
                { label: 'Avaliando Internamente', val: dashboardData.funnel.avaliandoInternamente, color: 'bg-blue-400', key: 'avaliandoInternamente' },
                { label: 'Aguardando Retorno do Lead', val: dashboardData.funnel.aguardandoRetorno, color: 'bg-indigo-400', key: 'aguardandoRetorno' },
                { label: 'Sem Interesse / Desqualificado', val: dashboardData.funnel.semInteresseDesq, color: 'bg-rose-500', key: 'semInteresseDesq' },
                { label: 'Lead Qualificado Sem Agenda', val: dashboardData.funnel.qualificadoSemAgenda, color: 'bg-teal-400', key: 'qualificadoSemAgenda' },
                { label: 'Agendou Reunião (Fim do Funil)', val: dashboardData.funnel.agendouReuniao, color: 'bg-emerald-500', key: 'agendouReuniao' },
              ].map((item, idx) => {
                const pct = dashboardData.funnel.total > 0
                  ? ((item.val / dashboardData.funnel.total) * 100).toFixed(0)
                  : 0

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedBucket(item.key)
                      setModalSearchQuery('')
                    }}
                    className="group cursor-pointer hover:bg-[var(--surface-raised)] p-1.5 rounded transition-all duration-150 border border-transparent hover:border-[var(--border)]"
                  >
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-[var(--text-secondary)] font-normal flex items-center gap-1 group-hover:text-[var(--accent)] transition-colors">
                        {item.label}
                        <span className="text-[10px] opacity-0 group-hover:opacity-100 text-[var(--accent)] font-medium transition-all duration-150 ml-1">
                          (ver leads)
                        </span>
                      </span>
                      <span className="text-[var(--text-primary)]">{item.val} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--surface-raised)] rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full ${item.color} rounded-full`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Breakdown Tables Platform and Region */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Platform breakdown */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
              <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Breakdown por Plataforma
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {Object.entries(dashboardData.leadsPorPlataforma).map(([plat, val]) => {
                  const pct = dashboardData.totalLeads > 0
                    ? ((val.total / dashboardData.totalLeads) * 100).toFixed(0)
                    : 0
                  return (
                    <div key={plat} className="flex justify-between items-center bg-[var(--surface-raised)] p-3 rounded border border-[var(--border)]">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)] text-xs">{plat}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{val.total} leads ({pct}%)</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--text-secondary)]">Conv. Agenda</p>
                        <p className="font-semibold text-emerald-600 text-xs">
                          {val.total > 0 ? ((val.agendouReuniao / val.total) * 100).toFixed(1) : '0.0'}%
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Region Breakdown */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
              <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Breakdown por Região
                </h3>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto max-h-[300px]">
                {Object.entries(dashboardData.leadsPorRegiao).map(([reg, val]) => {
                  const pct = val.total > 0 ? ((val.agendouReuniao / val.total) * 100).toFixed(1) : '0.0'
                  return (
                    <div key={reg} className="flex justify-between items-center text-xs font-medium border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
                      <span className="text-[var(--text-secondary)]">{reg} ({val.total} leads)</span>
                      <span className="text-emerald-600 font-semibold">{pct}% conv.</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Não Atenderam */}
      {activeTab === 'nao-atenderam' && (
        <div className="space-y-4">
          {/* PitchYES KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Sem Contato (Nenhuma Ligação)
                <InfoTooltip text="Leads cujo telefone NÃO aparece em nenhum arquivo de chamadas do drag-and-drop. Classificação: 'Sem Ligação'. Estes leads nunca foram discados pelo SDR." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.funnel.semLigacao}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({dashboardData.totalLeads > 0 ? ((dashboardData.funnel.semLigacao / dashboardData.totalLeads) * 100).toFixed(1) : '0.0'}% dos leads)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Nunca discados pelo SDR IA</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Sem Contato Efetivo
                <InfoTooltip text="Leads sem diálogo real: soma de 'Sem Ligação' + 'Caixa Postal / Não Atendido' + 'Ligação Curta'. Inclui todos os casos em que o lead não chegou a conversar com o SDR." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {dashboardData.funnel.semLigacao + dashboardData.funnel.caixaPostal + dashboardData.funnel.ligacaoCurta}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({dashboardData.totalLeads > 0 ? (((dashboardData.funnel.semLigacao + dashboardData.funnel.caixaPostal + dashboardData.funnel.ligacaoCurta) / dashboardData.totalLeads) * 100).toFixed(1) : '0.0'}%)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Sem Lig. + Caixa Postal + Lig. Curta</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Caixa Postal / Não Atendido
                <InfoTooltip text="Leads discados mas que caíram em caixa postal ou não atenderam. Detectado via IA no resumo da ligação (palavras: 'caixa postal', 'não atendido') ou chamadas com duração ≥ 15s sem diálogo." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.funnel.caixaPostal}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({dashboardData.totalLeads > 0 ? ((dashboardData.funnel.caixaPostal / dashboardData.totalLeads) * 100).toFixed(1) : '0.0'}%)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Chamadas sem resposta humana</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                % Sem Contato Efetivo
                <InfoTooltip text="Percentual de leads que não tiveram nenhuma conversa real. Cálculo: (Total − Contatos Efetivos) ÷ Total × 100. Contato efetivo = classificação diferente de 'Sem Ligação' e 'Caixa Postal'." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {dashboardData.totalLeads > 0 ? (((dashboardData.totalLeads - dashboardData.contatos) / dashboardData.totalLeads) * 100).toFixed(1) : '0.0'}%
                </span>
                <span className="text-xs text-[var(--text-secondary)]">sem diálogo</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Leads que não conversaram com o SDR</p>
            </div>
          </div>

          {/* Highlight Banner */}
          <div className="border border-[var(--border)] bg-[var(--surface-raised)] rounded-lg p-5 flex flex-col md:flex-row items-center gap-6 transition-colors duration-150">
            <div className="text-4xl font-semibold text-[var(--text-primary)] min-w-[120px] text-center md:text-left">
              {wasteRate}%
            </div>
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="block text-[var(--text-primary)] text-sm mb-1">
                dos leads gerados nunca chegaram a conversar com o SDR IA
              </strong>
              Estes leads representam cadastros que caíram em caixa postal, telefones inválidos, ou que simplesmente desligaram antes de iniciar a conversa. Isso demonstra a urgência de qualificação no topo do funil (anúncios e formulários).
            </div>
          </div>

          {/* Platform & Region Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Region Breakdown table */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
              <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Não-Atendimento por Região
                </h3>
              </div>
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                    <th className="px-4 py-2.5">Região</th>
                    <th className="px-4 py-2.5 text-right">Leads Totais</th>
                    <th className="px-4 py-2.5 text-right">Sem Contato</th>
                    <th className="px-4 py-2.5 text-right">% Não Atenderam</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dashboardData.leadsPorRegiao).map(([reg, val]) => {
                    const pct = val.total > 0 ? ((val.semLigacao / val.total) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={reg} className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150">
                        <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)]">{reg}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.total}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.semLigacao}</td>
                        <td className="px-4 py-2.5 text-right text-red-500 font-semibold">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Platform breakdown table */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
              <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Não-Atendimento por Plataforma
                </h3>
              </div>
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                    <th className="px-4 py-2.5">Plataforma</th>
                    <th className="px-4 py-2.5 text-right">Leads Totais</th>
                    <th className="px-4 py-2.5 text-right">Sem Contato</th>
                    <th className="px-4 py-2.5 text-right">% Não Atenderam</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dashboardData.leadsPorPlataforma).map(([plat, val]) => {
                    const pct = val.total > 0 ? ((val.semLigacao / val.total) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={plat} className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150">
                        <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)]">{plat}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.total}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.semLigacao}</td>
                        <td className="px-4 py-2.5 text-right text-red-500 font-semibold">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Campaign details table */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
            <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                Desempenho de Contato por Campanha
              </h3>
            </div>
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  <th className="px-4 py-2.5">Campanha</th>
                  <th className="px-4 py-2.5 text-right">Leads</th>
                  <th className="px-4 py-2.5 text-right">Sem Contato</th>
                  <th className="px-4 py-2.5 text-right">% Não Atenderam</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dashboardData.leadsPorCampanha).map(([camp, val]) => {
                  const pctVal = val.total > 0 ? (val.semLigacao / val.total) * 100 : 0
                  const pct = pctVal.toFixed(1)
                  let statusLabel = 'Crítico'
                  let statusClass = 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200/50 dark:border-red-900/30'

                  if (pctVal < 30) {
                    statusLabel = 'Excelente'
                    statusClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30'
                  } else if (pctVal < 50) {
                    statusLabel = 'Regular'
                    statusClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30'
                  }

                  return (
                    <tr key={camp} className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150">
                      <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)] truncate max-w-[200px]" title={camp}>{camp}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.total}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.semLigacao}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-550">{pct}%</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Análise de Ligações */}
      {activeTab === 'analise-ligacoes' && (
        <div className="space-y-4">
          {/* Calls KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Total Ligações
                <InfoTooltip text="Total de registros de chamadas nos arquivos drag-and-drop (pasta chamadas_pitchyes). Reflete os filtros de campanha e período ativos. Uma mesma ligação nunca é contada duas vezes (deduplicação por nome + telefone + data/hora)." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{filteredCalls.length}</span>
                <span className="text-xs text-[var(--text-secondary)]">tentativas</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Executadas pelo SDR IA</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Leads Contatados
                <InfoTooltip text="Leads que tiveram diálogo real com o SDR. Exclui 'Sem Ligação' e 'Caixa Postal / Não Atendido'. Taxa = Contatados ÷ Total de Leads × 100." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.contatos}</span>
                <span className="text-xs text-[var(--text-secondary)]">({contactRate}% dos leads)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Conversaram efetivamente com o SDR</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Média Ligações / Dia
                <InfoTooltip text="Total de ligações (filtradas) ÷ número de dias distintos com pelo menos 1 ligação. Indica o ritmo de prospecção diária do SDR IA no período selecionado." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {Object.keys(dashboardData.ligacoesPorDia).length > 0
                    ? (filteredCalls.length / Object.keys(dashboardData.ligacoesPorDia).length).toFixed(1)
                    : 0}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">ligações/dia</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Volume diário de prospecção</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
                Ligações Quentes
                <InfoTooltip text="Chamadas com Score ≥ 5 OU classificadas como 'Agendou Reunião', 'Lead Qualificado' ou 'Retorno Agendado'. Calculado sobre as ligações filtradas (drag-and-drop). Score é atribuído automaticamente pela IA com base no resumo da conversa." />
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.ligacoesQuentes.length}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({filteredCalls.length > 0 ? ((dashboardData.ligacoesQuentes.length / filteredCalls.length) * 100).toFixed(1) : '0.0'}%)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Score ≥ 5 ou classificação positiva</p>
            </div>
          </div>

          {/* Leads vs Calls Chart and Quality Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chart */}
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg space-y-3 lg:col-span-2 transition-colors duration-150">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                Leads Recebidos vs. Ligações Realizadas por Dia
              </h3>
              <div className="h-[280px]">
                <Line data={leadsVsCallsChartData} options={chartOptions} />
              </div>
            </div>

            {/* Quality Metrics */}
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg flex flex-col justify-between transition-colors duration-150">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 mb-3">
                  Qualidade das Chamadas
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)] text-sm">
                    <span className="text-[var(--text-secondary)]">Duração Média</span>
                    <span className="font-semibold text-[var(--text-primary)]">{dashboardData.duracao.media}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)] text-sm">
                    <span className="text-[var(--text-secondary)]">Duração Mediana</span>
                    <span className="font-semibold text-[var(--text-primary)]">{dashboardData.duracao.mediana}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)] text-sm">
                    <span className="text-[var(--text-secondary)]">Score Médio</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {(
                        Object.entries(dashboardData.scores).reduce((acc, [score, count]) => acc + parseInt(score) * count, 0) /
                        Math.max(1, Object.values(dashboardData.scores).reduce((a, b) => a + b, 0))
                      ).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 text-sm">
                    <span className="text-[var(--text-secondary)]">Conversão s/ Contatos</span>
                    <span className="font-semibold text-[var(--text-primary)]">{meetingRate}%</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)] text-center flex items-center justify-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-600 stroke-[1.5]" />
                <span>Calculado sobre {Object.values(dashboardData.scores).reduce((a,b)=>a+b, 0)} leads qualificados</span>
              </div>
            </div>
          </div>

          {/* Hot calls table section */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4 transition-colors duration-150">
            <div className="border-b border-[var(--border)] pb-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Ligações Mais Quentes
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Leads com alto score ou agendamento para follow-up imediato</p>
              </div>
              <span className="text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 px-2 py-0.5 rounded-full">
                {filteredHotCalls.length} identificadas
              </span>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-2.5">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-[var(--text-tertiary)] stroke-[1.5]" />
                <input
                  type="text"
                  placeholder="Buscar por nome do lead ou palavra-chave no resumo..."
                  value={hotSearchQuery}
                  onChange={(e) => setHotSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-4 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                />
              </div>
              <select
                value={hotFilterClassification}
                onChange={(e) => setHotFilterClassification(e.target.value)}
                className="h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
              >
                <option value="">Todas Classificações</option>
                <option value="Agendou Reunião">Agendou Reunião</option>
                <option value="Lead Qualificado">Lead Qualificado</option>
                <option value="Retorno Agendado">Retorno Agendado</option>
                <option value="Outros">Outros (Score &ge; 5)</option>
              </select>
            </div>

            {/* Hot Calls Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                    <th className="px-4 py-2.5">Lead</th>
                    <th className="px-4 py-2.5">Data/Hora</th>
                    <th className="px-4 py-2.5 text-right">Duração</th>
                    <th className="px-4 py-2.5 text-right">Score</th>
                    <th className="px-4 py-2.5">Classificação</th>
                    <th className="px-4 py-2.5 max-w-sm">Resumo da Conversa (IA)</th>
                    <th className="px-4 py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHotCalls.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-secondary)] text-xs">
                        Nenhuma ligação quente encontrada para os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredHotCalls.map((c, idx) => {
                      let tagClass = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-350 dark:border-slate-700'
                      if (c.classificacao === 'Agendou Reunião') {
                        tagClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50'
                      } else if (c.classificacao === 'Lead Qualificado') {
                        tagClass = 'bg-slate-100 text-slate-850 dark:bg-slate-800 dark:text-slate-100 border border-slate-300'
                      } else if (c.classificacao === 'Retorno Agendado') {
                        tagClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50'
                      }

                      return (
                        <tr key={idx} className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150">
                          <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)] truncate max-w-[150px]" title={c.nome}>
                            {c.nome}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs text-[var(--text-secondary)]">{c.data_hora}</td>
                          <td className="px-4 py-2.5 text-right text-xs text-[var(--text-primary)]">{formatDuration(c.duracao)}</td>
                          <td className="px-4 py-2.5 text-right font-extrabold text-amber-600">
                            {c.score !== null ? Number(c.score).toFixed(0) : '-'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${tagClass}`}>
                              {c.classificacao}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] max-w-md" title={c.resumo}>
                            <p className="line-clamp-2 leading-relaxed">{c.resumo}</p>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {c.link_gravacao && (
                                <a
                                  href={c.link_gravacao}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Ouvir Gravação"
                                  className="h-7 w-7 flex items-center justify-center bg-transparent border border-[var(--border)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md transition-colors duration-150"
                                >
                                  <Play className="w-3 h-3 stroke-[1.5]" />
                                </a>
                              )}
                              {c.whatsapp_link && (
                                <a
                                  href={c.whatsapp_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Contato via WhatsApp"
                                  className="h-7 w-7 flex items-center justify-center bg-transparent border border-[var(--border)] hover:bg-[var(--surface-raised)] text-[#22c55e] rounded-md transition-colors duration-150"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 stroke-[1.5]" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Chamado Insight */}
      {activeTab === 'insights' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <style>{`
            .insights-container {
              --radius-sm: 4px;
              --radius-md: 6px;
              --radius-lg: 8px;
              
              --red: #ef4444;
              --red-m: rgba(239, 68, 68, 0.2);
              --red-l: rgba(239, 68, 68, 0.05);
              
              --amber: #f59e0b;
              --amber-m: rgba(245, 158, 11, 0.2);
              --amber-l: rgba(245, 158, 11, 0.05);
              
              --green: #10b981;
              --green-m: rgba(16, 185, 129, 0.2);
              --green-l: rgba(16, 185, 129, 0.05);
              
              --blue: #3b82f6;
              --blue-m: rgba(59, 130, 246, 0.2);
              --blue-l: rgba(59, 130, 246, 0.05);
              
              --purple: #8b5cf6;
              --purple-m: rgba(139, 92, 246, 0.2);
              --purple-l: rgba(139, 92, 246, 0.05);

              color: var(--text-primary);
            }

            .insights-container .section {
              margin-bottom: 28px;
            }

            .insights-container .section-label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: .08em;
              color: var(--text-secondary);
              border-bottom: 1px solid var(--border);
              padding-bottom: 8px;
              margin-bottom: 16px;
            }

            .insights-container .three-col {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 16px;
            }

            .insights-container .insight-card {
              border-radius: var(--radius-lg);
              padding: 18px;
              border: 1px solid var(--border);
              border-left: 4px solid var(--accent);
              background: var(--surface);
            }

            .insights-container .insight-card.red    { background: var(--red-l);    --accent: var(--red);    border-color: var(--red-m); }
            .insights-container .insight-card.amber  { background: var(--amber-l);  --accent: var(--amber);  border-color: var(--amber-m); }
            .insights-container .insight-card.green  { background: var(--green-l);  --accent: var(--green);  border-color: var(--green-m); }
            .insights-container .insight-card.blue   { background: var(--blue-l);   --accent: var(--blue);   border-color: var(--blue-m); }
            .insights-container .insight-card.purple { background: var(--purple-l); --accent: var(--purple); border-color: var(--purple-m); }

            .insights-container .insight-badge {
              font-size: 9px;
              font-weight: 700;
              letter-spacing: .08em;
              text-transform: uppercase;
              color: var(--accent);
              margin-bottom: 6px;
            }

            .insights-container .insight-title {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-primary);
              margin-bottom: 6px;
            }

            .insights-container .insight-body {
              font-size: 12px;
              color: var(--text-secondary);
              line-height: 1.5;
            }

            .insights-container .card {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: var(--radius-lg);
              overflow: hidden;
            }

            .insights-container .card-header {
              background: var(--surface-raised);
              padding: 10px 16px;
              border-bottom: 1px solid var(--border);
            }

            .insights-container .card-header-title {
              font-size: 10px;
              font-weight: 700;
              color: var(--text-secondary);
              text-transform: uppercase;
              letter-spacing: .08em;
            }

            .insights-container .diag-item {
              display: grid;
              grid-template-columns: 28px 1fr 90px 240px;
              gap: 16px;
              padding: 16px;
              border-bottom: 1px solid var(--border);
              align-items: start;
            }

            @media (max-width: 900px) {
              .insights-container .diag-item {
                grid-template-columns: 1fr;
                gap: 8px;
              }
            }

            .insights-container .diag-item:last-child {
              border-bottom: none;
            }

            .insights-container .diag-num {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 700;
              flex-shrink: 0;
              background: var(--surface-raised);
              color: var(--text-primary);
              border: 1px solid var(--border);
            }

            .insights-container .diag-title {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-primary);
              margin-bottom: 4px;
            }

            .insights-container .diag-body {
              font-size: 12px;
              color: var(--text-secondary);
              line-height: 1.5;
            }

            .insights-container .diag-prio {
              font-size: 10px;
            }

            .insights-container .diag-action {
              font-size: 12px;
              color: var(--text-secondary);
              line-height: 1.5;
            }

            .insights-container .diag-action strong {
              display: block;
              font-size: 9px;
              font-weight: 700;
              letter-spacing: .08em;
              text-transform: uppercase;
              color: var(--text-tertiary);
              margin-bottom: 4px;
            }

            .insights-container .diag-item.crit  { background: var(--red-l); }
            .insights-container .diag-item.alto  { background: var(--amber-l); }
            .insights-container .diag-item.medio { background: var(--purple-l); }
            .insights-container .diag-item.pos   { background: var(--green-l); }

            .insights-container .tag {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }

            .insights-container .tag-red { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
            .insights-container .tag-amber { background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; }
            .insights-container .tag-purple { background: #f3e8ff; color: #6d28d9; border: 1px solid #e9d5ff; }
            .insights-container .tag-green { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }

            .insights-container .rec-item {
              display: flex;
              gap: 16px;
              padding: 16px;
              border-bottom: 1px solid var(--border);
              align-items: flex-start;
            }

            .insights-container .rec-item:last-child {
              border-bottom: none;
            }

            .insights-container .rec-dot {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 700;
              flex-shrink: 0;
              background: var(--surface-raised);
              border: 1px solid var(--border);
              color: var(--text-primary);
            }

            .insights-container .rec-dot.tag-red { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
            .insights-container .rec-dot.tag-amber { background: #fef3c7; color: #b45309; border-color: #fcd34d; }

            .insights-container .rec-content {
              flex: 1;
            }

            .insights-container .rec-title {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-primary);
              margin-bottom: 4px;
            }

            .insights-container .rec-body {
              font-size: 12px;
              color: var(--text-secondary);
              line-height: 1.5;
            }

            .insights-container .rec-meta {
              display: flex;
              gap: 8px;
              margin-top: 8px;
              flex-wrap: wrap;
            }

            .insights-container .rec-chip {
              font-size: 9px;
              font-weight: 500;
              padding: 2px 8px;
              border-radius: 4px;
              background: var(--surface-raised);
              color: var(--text-secondary);
              border: 1px solid var(--border);
            }

            .insights-container .rec-chip.tag-red {
              color: #b91c1c;
              background: #fee2e2;
              border-color: #fca5a5;
            }

            .insights-container .rec-chip.tag-amber {
              color: #b45309;
              background: #fef3c7;
              border-color: #fcd34d;
            }
          `}</style>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-lg space-y-4 transition-colors duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500 stroke-[1.5]" />
                  Painel de Insights Inteligentes
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Gere recomendações e análises estratégicas das suas campanhas utilizando Inteligência Artificial (GPT-4o mini).
                </p>
              </div>
              <button
                onClick={handleGenerateInsights}
                disabled={isGeneratingInsights || !isAuthorizedToGenerate}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-4 py-2 rounded-md text-xs font-semibold transition-all duration-150 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!isAuthorizedToGenerate ? "Apenas Head e Master podem gerar insights" : ""}
              >
                <Sparkles className="w-3.5 h-3.5 stroke-[1.5]" />
                {isGeneratingInsights ? 'Gerando Insights...' : 'Gerar Insights'}
              </button>
            </div>

            {!isAuthorizedToGenerate && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-lg text-amber-700 dark:text-amber-400 text-[11px] leading-relaxed">
                ⚠️ <strong>Aviso de Permissão:</strong> O botão de geração de insights está desabilitado para o seu nível de acesso. Apenas usuários com perfil <strong>Head</strong> ou <strong>Master</strong> possuem permissão para executar esta ação.
              </div>
            )}

            {insightError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg text-red-700 dark:text-red-400 text-xs">
                {insightError}
              </div>
            )}

            {insights ? (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface-raised)]">
                <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)] flex justify-between items-center">
                  <span className="text-[10px] uppercase font-semibold text-[var(--text-secondary)] tracking-wider">
                    Diagnóstico Estratégico
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {generatedAt ? `Gerado em: ${generatedAt}` : 'Modelo: GPT-4o mini'}
                  </span>
                </div>
                <div
                  className="p-5 overflow-y-auto max-h-[65vh] max-w-none text-xs text-[var(--text-primary)] leading-relaxed space-y-4 insights-container bg-[var(--background)]"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(insights) }}
                />
              </div>
            ) : (
              <div className="border border-dashed border-[var(--border)] rounded-lg p-12 text-center text-[var(--text-secondary)]">
                <Sparkles className="w-8 h-8 text-[var(--text-tertiary)] stroke-[1] mx-auto mb-3" />
                <p className="text-xs">Nenhum insight gerado ainda para os filtros ativos.</p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                  Clique no botão "Gerar Insights" acima para analisar as campanhas selecionadas.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bucket Leads Modal */}
      {selectedBucket && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Leads no bucket: {
                    selectedBucket === 'total' ? 'Total de Leads' :
                    selectedBucket === 'semLigacao' ? 'Sem Ligação (nunca discados)' :
                    selectedBucket === 'caixaPostal' ? 'Caixa Postal / Não Atendido' :
                    selectedBucket === 'ligacaoCurta' ? 'Ligação Curta / Sem Diálogo (< 15s)' :
                    selectedBucket === 'pediuLigarDepois' ? 'Pediu para Ligar Depois' :
                    selectedBucket === 'avaliandoInternamente' ? 'Avaliando Internamente' :
                    selectedBucket === 'aguardandoRetorno' ? 'Aguardando Retorno do Lead' :
                    selectedBucket === 'inconclusivo' ? 'Contato Inconclusivo' :
                    selectedBucket === 'semInteresseDesq' ? 'Sem Interesse / Desqualificado' :
                    selectedBucket === 'qualificadoSemAgenda' ? 'Lead Qualificado Sem Agenda' :
                    selectedBucket === 'agendouReuniao' ? 'Agendou Reunião' : ''
                  }
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Mostrando {searchedModalLeads.length} de {leadsInSelectedBucket.length} leads no bucket ({filteredLeads.length} total filtrados)
                </p>
              </div>
              <button
                onClick={() => setSelectedBucket(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1.5 rounded-lg hover:bg-[var(--surface-raised)]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {/* Modal Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-tertiary)] stroke-[1.5]" />
                <input
                  type="text"
                  placeholder="Buscar lead por nome, telefone ou campanha..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] pl-9 pr-4 py-2 rounded-lg text-xs placeholder-[var(--text-tertiary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                />
              </div>

              {/* Table / List */}
              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface-raised)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                        <th className="p-3">Nome</th>
                        <th className="p-3">Telefone</th>
                        <th className="p-3">Campanha</th>
                        <th className="p-3">Plataforma</th>
                        <th className="p-3">Duração</th>
                        <th className="p-3">WhatsApp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs text-[var(--text-primary)]">
                      {searchedModalLeads.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-[var(--text-secondary)]">
                            Nenhum lead encontrado neste bucket para os filtros ativos.
                          </td>
                        </tr>
                      ) : (
                        searchedModalLeads.map((lead, index) => {
                          const hasCall = lead['Chamada - Classificação'] !== 'Sem Ligação';
                          const phoneNormalized = lead.phone || '';
                          const isWhatsapp = phoneNormalized !== '';
                          const whatsappLink = isWhatsapp ? `https://wa.me/${phoneNormalized.replace(/\D/g, '')}` : null;

                          return (
                            <tr key={index} className="hover:bg-[var(--surface)] transition-colors duration-100">
                              <td className="p-3 font-medium">
                                <div className="flex flex-col">
                                  <span>{lead.Nome || 'Sem Nome'}</span>
                                  {lead['Chamada - Classificação'] && (
                                    <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
                                      {lead['Chamada - Classificação']}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 font-mono">{lead.phone || 'Sem número'}</td>
                              <td className="p-3 truncate max-w-[150px]" title={lead.Campanha}>{lead.Campanha}</td>
                              <td className="p-3">{lead.Plataforma}</td>
                              <td className="p-3">
                                {hasCall && lead['Chamada - Duração (segundos)'] !== null
                                  ? formatDuration(lead['Chamada - Duração (segundos)'])
                                  : '-'}
                              </td>
                              <td className="p-3">
                                {whatsappLink ? (
                                  <a
                                    href={whatsappLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-500 hover:underline text-[11px] font-medium flex items-center gap-1"
                                  >
                                    <MessageSquare className="w-3 h-3 stroke-[1.5]" />
                                    Conversar
                                  </a>
                                ) : (
                                  <span className="text-[var(--text-tertiary)]">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-raised)] flex justify-end">
              <button
                onClick={() => setSelectedBucket(null)}
                className="px-4 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--surface-raised)] transition-colors duration-150"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
