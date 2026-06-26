import { useState, useEffect, useMemo } from 'react'
import { leadsService } from '../services/leads'
import { aggregateData, formatDuration } from '../utils/dashboardHelpers'
import type {
  AggregatedDashboardData,
  Call,
  Lead,
} from '../utils/dashboardHelpers'
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
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

// Register ChartJS plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Raw data from server
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [allCalls, setAllCalls] = useState<Call[]>([])
  const [campaignList, setCampaignList] = useState<string[]>([])

  // Active filters
  const [activeTab, setActiveTab] = useState<'geral' | 'nao-atenderam' | 'analise-ligacoes'>('geral')
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [customDateStart, setCustomDateStart] = useState<string>('')
  const [customDateEnd, setCustomDateEnd] = useState<string>('')

  // Search & filter state for hot calls table
  const [hotSearchQuery, setHotSearchQuery] = useState('')
  const [hotFilterClassification, setHotFilterClassification] = useState('')

  // Load data on mount
  useEffect(() => {
    leadsService.getDashboardData()
      .then((data) => {
        setAllLeads(data.allLeads || [])
        setAllCalls(data.allCalls || [])
        setCampaignList(data.campaigns || [])
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

  // Chart setup
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

    // Check if dark mode is active to customize chart colors
    const isDark = document.documentElement.classList.contains('dark')

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
          className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-md transition-colors duration-150"
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
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
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
      <div className="flex border-b border-[var(--border)]">
        {[
          { id: 'geral', label: 'Análise Marketing Geral', icon: <BarChart3 className="w-4 h-4 stroke-[1.5]" /> },
          { id: 'nao-atenderam', label: 'Análise PitchYES', icon: <PhoneOff className="w-4 h-4 stroke-[1.5]" /> },
          { id: 'analise-ligacoes', label: 'Análise de Ligações', icon: <PhoneCall className="w-4 h-4 stroke-[1.5]" /> },
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Total de Leads</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.totalLeads}</span>
                <span className="text-xs text-[var(--text-secondary)]">cadastros</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Facebook &amp; Instagram Ads</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Taxa de Contato</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{contactRate}%</span>
                <span className="text-xs text-[var(--text-secondary)]">({dashboardData.contatos} contatados)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Atendidos SDR com retorno</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Reuniões Agendadas</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.agendados}</span>
                <span className="text-xs text-[var(--text-secondary)]">({meetingRate}% conversão)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Agendamentos no Calendly/Google</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Conversão de Contatos</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {dashboardData.contatos > 0
                    ? ((dashboardData.agendados / dashboardData.contatos) * 100).toFixed(1)
                    : '0.0'}%
                </span>
                <span className="text-xs text-[var(--text-secondary)]">de contatos úteis</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Conversão SDR pós-atendimento</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                Lead Time Médio
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.leadTime.media}</span>
                <span className="text-xs text-[var(--text-secondary)]">(mediana: {dashboardData.leadTime.mediana})</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Tempo médio até o 1º atendimento ({dashboardData.leadTime.totalLeadsComChamada} leads)</p>
            </div>
          </div>

          {/* Funnel & Reasons section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sales Funnel */}
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg space-y-3 transition-colors duration-150">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
                Funil de Vendas SDR (Ligação)
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Total de Leads Captados', val: dashboardData.funnel.total, color: 'bg-slate-400' },
                  { label: 'Sem Ligação Efetiva (Perda inicial)', val: dashboardData.funnel.semLigacao, color: 'bg-slate-300' },
                  { label: 'Caixa Postal / Não Atendido', val: dashboardData.funnel.caixaPostal, color: 'bg-amber-300' },
                  { label: 'Ligação Curta / Sem Diálogo', val: dashboardData.funnel.ligacaoCurta, color: 'bg-red-300' },
                  { label: 'Sem Contato Efetivo', val: dashboardData.funnel.semContatoEfetivo, color: 'bg-amber-400' },
                  { label: 'Pediu para Ligar Depois', val: dashboardData.funnel.pediuLigarDepois, color: 'bg-yellow-450' },
                  { label: 'Avaliando Internamente', val: dashboardData.funnel.avaliandoInternamente, color: 'bg-blue-300' },
                  { label: 'Aguardando Retorno do Lead', val: dashboardData.funnel.aguardandoRetorno, color: 'bg-indigo-300' },
                  { label: 'Sem Interesse / Desqualificado', val: dashboardData.funnel.semInteresseDesq, color: 'bg-red-400' },
                  { label: 'Lead Qualificado Sem Agenda', val: dashboardData.funnel.qualificadoSemAgenda, color: 'bg-emerald-300' },
                  { label: 'Agendou Reunião (Fim do Funil)', val: dashboardData.funnel.agendouReuniao, color: 'bg-[var(--accent)]' },
                ].map((item, idx) => {
                  const pct = dashboardData.funnel.total > 0
                    ? ((item.val / dashboardData.funnel.total) * 100).toFixed(0)
                    : 0
                  return (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-[var(--text-secondary)] font-normal">{item.label}</span>
                        <span className="text-[var(--text-primary)]">{item.val} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-[var(--surface-raised)] rounded-full overflow-hidden">
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

            {/* Motivos de Perda */}
            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg space-y-3 transition-colors duration-150">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
                Motivos de Perda / Não-Atendimento
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Sem Ligação / Retorno Negativo', val: dashboardData.motivos.semLigacao, color: 'bg-slate-350' },
                  { label: 'Caixa Postal / Não Atendido', val: dashboardData.motivos.caixaPostal, color: 'bg-amber-300' },
                  { label: 'Ligação Curta / Sem Diálogo', val: dashboardData.motivos.ligacaoCurta, color: 'bg-red-300' },
                  { label: 'Pediu para Ligar Depois', val: dashboardData.motivos.pediuLigarDepois, color: 'bg-yellow-450' },
                  { label: 'Avaliando Internamente', val: dashboardData.motivos.avaliandoInternamente, color: 'bg-blue-300' },
                  { label: 'Recusa Direta / Sem Interesse', val: dashboardData.motivos.recusaDireta, color: 'bg-red-400' },
                  { label: 'Fora do Perfil (Ideal Customer Profile)', val: dashboardData.motivos.foraPerfil, color: 'bg-purple-300' },
                  { label: 'Lead Hostil / Irritado', val: dashboardData.motivos.leadHostil, color: 'bg-rose-450' },
                  { label: 'Qualificado ou Agendado', val: dashboardData.motivos.qualificadoAgendou, color: 'bg-emerald-300' },
                ].map((item, idx) => {
                  const totalMotivos = Object.values(dashboardData.motivos).reduce((a, b) => a + b, 0)
                  const pct = totalMotivos > 0 ? ((item.val / totalMotivos) * 100).toFixed(0) : 0
                  return (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-[var(--text-secondary)] font-normal">{item.label}</span>
                        <span className="text-[var(--text-primary)]">{item.val} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-[var(--surface-raised)] rounded-full overflow-hidden">
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
          </div>

          {/* Breakdown Tables Campaign, Region, Platform */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Campaigns Table */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden lg:col-span-2 transition-colors duration-150">
              <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Desempenho por Campanha
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[350px]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                      <th className="px-4 py-2.5">Campanha</th>
                      <th className="px-4 py-2.5 text-right">Leads</th>
                      <th className="px-4 py-2.5 text-right">Sem Ligação</th>
                      <th className="px-4 py-2.5 text-right">Agendados</th>
                      <th className="px-4 py-2.5 text-right">% Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dashboardData.leadsPorCampanha).map(([camp, val]) => {
                      const conv = val.total > 0 ? ((val.agendouReuniao / val.total) * 100).toFixed(1) : '0.0'
                      return (
                        <tr key={camp} className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150">
                          <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)] truncate max-w-[250px]" title={camp}>
                            {camp}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.total}</td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{val.semLigacao}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{val.agendouReuniao}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[var(--text-primary)]">{conv}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Platform & Region breakdowns */}
            <div className="space-y-4">
              {/* Platform breakdown */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
                <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                  <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                    Breakdown por Plataforma
                  </h3>
                </div>
                <div className="p-3 space-y-3">
                  {Object.entries(dashboardData.leadsPorPlataforma).map(([plat, val]) => {
                    const pct = dashboardData.totalLeads > 0
                      ? ((val.total / dashboardData.totalLeads) * 100).toFixed(0)
                      : 0
                    return (
                      <div key={plat} className="flex justify-between items-center bg-[var(--surface-raised)] p-2.5 rounded border border-[var(--border)]">
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
                <div className="p-3 space-y-2 max-h-[160px] overflow-y-auto">
                  {Object.entries(dashboardData.leadsPorRegiao).map(([reg, val]) => {
                    const pct = val.total > 0 ? ((val.agendouReuniao / val.total) * 100).toFixed(1) : '0.0'
                    return (
                      <div key={reg} className="flex justify-between items-center text-xs font-medium border-b border-[var(--border)] pb-1 last:border-0 last:pb-0">
                        <span className="text-[var(--text-secondary)]">{reg} ({val.total})</span>
                        <span className="text-emerald-600 font-semibold">{pct}% conv.</span>
                      </div>
                    )
                  })}
                </div>
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
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Total Não Atenderam</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.funnel.semLigacao}</span>
                <span className="text-xs text-[var(--text-secondary)]">({wasteRate}% dos leads)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Sem qualquer contato ou retorno</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Sem Ligação Efetiva</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {dashboardData.funnel.semLigacao + dashboardData.funnel.caixaPostal}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({(((dashboardData.funnel.semLigacao + dashboardData.funnel.caixaPostal) / dashboardData.totalLeads) * 100).toFixed(1)}%)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Inclui caixa postal/desligado</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Caixa Postal / Não Atendido</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.funnel.caixaPostal}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({((dashboardData.funnel.caixaPostal / dashboardData.totalLeads) * 100).toFixed(1)}%)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Chamadas ativas em caixa postal</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">% Desperdício Geral</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {(((dashboardData.totalLeads - dashboardData.contatos) / dashboardData.totalLeads) * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-[var(--text-secondary)]">de leads inúteis</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Contatos que nunca falaram com o SDR</p>
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
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Total Ligações</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{allCalls.length}</span>
                <span className="text-xs text-[var(--text-secondary)]">tentativas</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Executadas pelo robô de voz</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Leads Contatados</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.contatos}</span>
                <span className="text-xs text-[var(--text-secondary)]">({contactRate}% contatos)</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Atenderam e conversaram</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Média Ligações / Dia</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">
                  {Object.keys(dashboardData.ligacoesPorDia).length > 0
                    ? (allCalls.length / Object.keys(dashboardData.ligacoesPorDia).length).toFixed(1)
                    : 0}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">ligações/dia</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Volume diário de prospecção</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg transition-colors duration-150">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Ligações Quentes</p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{dashboardData.ligacoesQuentes.length}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({((dashboardData.ligacoesQuentes.length / allCalls.length) * 100).toFixed(1)}%)
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Score &ge; 5 ou agendadas</p>
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
    </div>
  )
}
