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
      // Use max dataset date if within recent limits or fallback
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
    if (dateFilter === 'esse_mes') {
      start.setDate(1)
      return { start, end }
    }

    return null
  }, [dateFilter, referenceDate])

  // 3. Filter leads & calls locally
  const filteredLeads = useMemo(() => {
    let result = allLeads

    // Apply campaign filter
    if (selectedCampaign !== 'all') {
      result = result.filter((l) => l.Campanha === selectedCampaign)
    }

    // Apply date range filter
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

    // Apply campaign filter (leads matched filter to campaigns)
    if (selectedCampaign !== 'all') {
      // In allCalls, campaign is in call['Tag'] or matches lead's campaign
      result = result.filter((c) => {
        const lead = allLeads.find((l) => l.phone === c['Tel Meta'])
        return lead ? lead.Campanha === selectedCampaign : c.tag === selectedCampaign
      })
    }

    // Apply date range filter
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
      // Classification filter
      if (hotFilterClassification) {
        if (hotFilterClassification === 'Outros') {
          // Score >= 5 but not in primary hot categories
          if (['Agendou Reunião', 'Lead Qualificado', 'Retorno Agendado'].includes(c.classificacao)) {
            return false
          }
        } else if (c.classificacao !== hotFilterClassification) {
          return false
        }
      }

      // Search query
      if (hotSearchQuery) {
        const query = hotSearchQuery.toLowerCase()
        const nameMatch = c.nome.toLowerCase().includes(query)
        const summaryMatch = c.resumo.toLowerCase().includes(query)
        const phoneMatch = c.telefone.includes(query)
        return nameMatch || summaryMatch || phoneMatch
      }

      return true
    })
  }, [dashboardData.ligacoesQuentes, hotFilterClassification, hotSearchQuery])

  // Chart configuration for react-chartjs-2
  const leadsVsCallsChartData = useMemo(() => {
    // Collect all dates from leads and calls
    const allDates = new Set<string>()
    Object.keys(dashboardData.leadsPorDia).forEach((d) => allDates.add(d))
    Object.keys(dashboardData.ligacoesPorDia).forEach((d) => allDates.add(d))
    const sortedDates = Array.from(allDates).sort()

    // Format dates to DD/MM for labels
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
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#3B82F6',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Ligações Realizadas',
          data: callsSeries,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.05)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#F59E0B',
          tension: 0.3,
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
          color: 'var(--text)',
          font: { family: 'Inter', size: 12 },
        },
      },
      tooltip: {
        padding: 12,
        titleFont: { family: 'Inter', size: 13, weight: 'bold' as const },
        bodyFont: { family: 'Inter', size: 12 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: 'var(--text)', font: { family: 'Inter', size: 11 } },
      },
      y: {
        grid: { color: 'rgba(156, 163, 175, 0.1)' },
        ticks: { color: 'var(--text)', font: { family: 'Inter', size: 11 } },
      },
    },
  }

  // Calculate funnel coverage and conversions
  const contactRate = dashboardData.totalLeads > 0
    ? ((dashboardData.contatos / dashboardData.totalLeads) * 100).toFixed(1)
    : '0.0'
  const meetingRate = dashboardData.totalLeads > 0
    ? ((dashboardData.agendados / dashboardData.totalLeads) * 100).toFixed(1)
    : '0.0'
  const wasteRate = dashboardData.totalLeads > 0
    ? (((dashboardData.totalLeads - dashboardData.contatos) / dashboardData.totalLeads) * 100).toFixed(1)
    : '0.0'

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent"></div>
        <p className="text-sm font-medium text-gray-400">Carregando dados analíticos do banco de dados...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 max-w-2xl mx-auto my-10">
        <h3 className="font-bold text-lg mb-2">Erro de Carregamento</h3>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition"
        >
          Tentar Novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header and Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard de Leads & SDR</h1>
          <p className="text-sm text-gray-400 mt-1">
            Dados carregados em tempo real do banco de dados SQLite
          </p>
        </div>

        {/* Date Filter Quick Display */}
        <div className="text-xs bg-gray-500/10 px-3 py-1.5 rounded-full border border-gray-500/20 font-medium text-gray-300 self-start md:self-auto">
          Status: {dateFilter === 'all' ? 'Exibindo Todos os Dados' : `Exibindo dados de ${dateFilter.replace('_', ' ')}`}
        </div>
      </div>

      {/* FILTERS CONTROL PANEL */}
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          {/* Campaign Select */}
          <div className="flex-1 max-w-md space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Filtrar por Campanha de Marketing
            </label>
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="w-full bg-[var(--ice)] border border-[var(--border)] rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-accent/50 outline-none text-[var(--text)]"
            >
              <option value="all">Todas as Campanhas</option>
              {campaignList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Date Picker Button Group */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Filtrar por Período
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Tudo', value: 'all' },
                { label: 'Hoje', value: 'hoje' },
                { label: 'Ontem', value: 'ontem' },
                { label: 'Esta Semana', value: 'essa_semana' },
                { label: 'Semana Passada', value: 'semana_passada' },
                { label: 'Este Mês', value: 'esse_mes' },
              ].map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => setDateFilter(btn.value)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    dateFilter === btn.value
                      ? 'bg-accent border-accent text-white shadow-sm'
                      : 'bg-[var(--ice)] border-[var(--border)] text-gray-400 hover:text-[var(--text)] hover:border-gray-500'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex border-b border-[var(--border)]">
        {[
          { id: 'geral', label: 'Análise Marketing Geral', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'nao-atenderam', label: 'Análise PitchYES', icon: <PhoneOff className="w-4 h-4" /> },
          { id: 'analise-ligacoes', label: 'Análise de Ligações', icon: <PhoneCall className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-all -mb-px ${
              activeTab === tab.id
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-gray-400 hover:text-[var(--text)]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB PANELS */}

      {/* TAB 1: Marketing Geral */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          {/* General KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total de Leads</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-blue-500">{dashboardData.totalLeads}</span>
                <span className="text-xs text-gray-400">cadastros totais</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Facebook e Instagram Ads
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Taxa de Contato</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-red-500">{contactRate}%</span>
                <span className="text-xs text-gray-400">({dashboardData.contatos} leads)</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Chamadas atendas com retorno
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Reuniões Agendadas</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-green-500">{dashboardData.agendados}</span>
                <span className="text-xs text-gray-400">({meetingRate}% conv.)</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Eventos agendados no Calendly/Google
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversão de Contatos</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-purple-500">
                  {dashboardData.contatos > 0
                    ? ((dashboardData.agendados / dashboardData.contatos) * 100).toFixed(1)
                    : '0.0'}%
                </span>
                <span className="text-xs text-gray-400">de contatos úteis</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Conversão do SDR pós-contato
              </p>
            </div>
          </div>

          {/* Funnel & Reasons section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Funnel */}
            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Funil de Vendas SDR (Ligação)</h3>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Total de Leads Captados', val: dashboardData.funnel.total, color: 'bg-blue-500' },
                  { label: 'Sem Ligação Efetiva (Perda inicial)', val: dashboardData.funnel.semLigacao, color: 'bg-gray-500' },
                  { label: 'Caixa Postal / Não Atendido', val: dashboardData.funnel.caixaPostal, color: 'bg-orange-500' },
                  { label: 'Ligação Curta / Sem Diálogo', val: dashboardData.funnel.ligacaoCurta, color: 'bg-red-500' },
                  { label: 'Sem Contato Efetivo', val: dashboardData.funnel.semContatoEfetivo, color: 'bg-amber-500' },
                  { label: 'Pediu para Ligar Depois', val: dashboardData.funnel.pediuLigarDepois, color: 'bg-yellow-500' },
                  { label: 'Avaliando Internamente', val: dashboardData.funnel.avaliandoInternamente, color: 'bg-teal-500' },
                  { label: 'Aguardando Retorno do Lead', val: dashboardData.funnel.aguardandoRetorno, color: 'bg-indigo-500' },
                  { label: 'Sem Interesse / Desqualificado', val: dashboardData.funnel.semInteresseDesq, color: 'bg-pink-500' },
                  { label: 'Lead Qualificado Sem Agenda', val: dashboardData.funnel.qualificadoSemAgenda, color: 'bg-green-400' },
                  { label: 'Agendou Reunião (Fim do Funil)', val: dashboardData.funnel.agendouReuniao, color: 'bg-green-600' },
                ].map((item, idx) => {
                  const pct = dashboardData.funnel.total > 0
                    ? ((item.val / dashboardData.funnel.total) * 100).toFixed(0)
                    : 0
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-300">{item.label}</span>
                        <span className="text-gray-400">{item.val} ({pct}%)</span>
                      </div>
                      <div className="h-2 w-full bg-gray-700/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Motivos de Perda */}
            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Motivos de Perda / Não-Atendimento</h3>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'Sem Ligação / Retorno Negativo', val: dashboardData.motivos.semLigacao, color: 'bg-gray-500' },
                  { label: 'Caixa Postal / Não Atendido', val: dashboardData.motivos.caixaPostal, color: 'bg-orange-500' },
                  { label: 'Ligação Curta / Sem Diálogo', val: dashboardData.motivos.ligacaoCurta, color: 'bg-red-500' },
                  { label: 'Pediu para Ligar Depois', val: dashboardData.motivos.pediuLigarDepois, color: 'bg-yellow-500' },
                  { label: 'Avaliando Internamente', val: dashboardData.motivos.avaliandoInternamente, color: 'bg-teal-500' },
                  { label: 'Recusa Direta / Sem Interesse', val: dashboardData.motivos.recusaDireta, color: 'bg-red-600' },
                  { label: 'Fora do Perfil (Ideal Customer Profile)', val: dashboardData.motivos.foraPerfil, color: 'bg-pink-600' },
                  { label: 'Lead Hostil / Irritado', val: dashboardData.motivos.leadHostil, color: 'bg-rose-700' },
                  { label: 'Qualificado ou Agendado', val: dashboardData.motivos.qualificadoAgendou, color: 'bg-green-500' },
                ].map((item, idx) => {
                  const totalMotivos = Object.values(dashboardData.motivos).reduce((a, b) => a + b, 0)
                  const pct = totalMotivos > 0 ? ((item.val / totalMotivos) * 100).toFixed(0) : 0
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-300">{item.label}</span>
                        <span className="text-gray-400">{item.val} ({pct}%)</span>
                      </div>
                      <div className="h-2 w-full bg-gray-700/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Campaigns Table */}
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden lg:col-span-2">
              <div className="p-4 border-b border-[var(--border)] bg-gray-500/5">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300">Desempenho por Campanha</h3>
              </div>
              <div className="overflow-x-auto max-h-[350px]">
                <table className="w-full text-sm text-left text-gray-400">
                  <thead className="text-xs uppercase bg-gray-500/10 text-gray-300 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Campanha</th>
                      <th className="px-4 py-3 text-right">Leads</th>
                      <th className="px-4 py-3 text-right">Sem Ligação</th>
                      <th className="px-4 py-3 text-right">Agendados</th>
                      <th className="px-4 py-3 text-right">% Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dashboardData.leadsPorCampanha).map(([camp, val]) => {
                      const conv = val.total > 0 ? ((val.agendouReuniao / val.total) * 100).toFixed(1) : '0.0'
                      return (
                        <tr key={camp} className="border-b border-[var(--border)] hover:bg-gray-500/5 transition">
                          <td className="px-4 py-3 font-medium text-white truncate max-w-[250px]" title={camp}>
                            {camp}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">{val.total}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{val.semLigacao}</td>
                          <td className="px-4 py-3 text-right text-green-400 font-semibold">{val.agendouReuniao}</td>
                          <td className="px-4 py-3 text-right font-semibold text-white">{conv}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Platform & Region cards side by side (vertically in grid column) */}
            <div className="space-y-6">
              {/* Platform breakdown */}
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[var(--border)] bg-gray-500/5">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300 font-semibold">Breakdown por Plataforma</h3>
                </div>
                <div className="p-4 space-y-4">
                  {Object.entries(dashboardData.leadsPorPlataforma).map(([plat, val]) => {
                    const pct = dashboardData.totalLeads > 0
                      ? ((val.total / dashboardData.totalLeads) * 100).toFixed(0)
                      : 0
                    return (
                      <div key={plat} className="flex justify-between items-center bg-[var(--ice)] p-3 rounded-lg border border-[var(--border)]">
                        <div>
                          <p className="font-bold text-white text-sm">{plat}</p>
                          <p className="text-xs text-gray-400 mt-1">{val.total} leads ({pct}%)</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Conv. Agendamento</p>
                          <p className="font-extrabold text-green-400 text-sm">
                            {val.total > 0 ? ((val.agendouReuniao / val.total) * 100).toFixed(1) : '0.0'}%
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Region Breakdown */}
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[var(--border)] bg-gray-500/5">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300 font-semibold">Breakdown por Região</h3>
                </div>
                <div className="p-4 space-y-3 max-h-[160px] overflow-y-auto">
                  {Object.entries(dashboardData.leadsPorRegiao).map(([reg, val]) => {
                    const pct = val.total > 0 ? ((val.agendouReuniao / val.total) * 100).toFixed(1) : '0.0'
                    return (
                      <div key={reg} className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-gray-300">{reg} ({val.total})</span>
                        <span className="text-green-400 font-bold">{pct}% conv.</span>
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
        <div className="space-y-6">
          {/* PitchYES KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Não Atenderam</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-red-500">{dashboardData.funnel.semLigacao}</span>
                <span className="text-xs text-gray-400">({wasteRate}% dos leads)</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Sem qualquer contato ou retorno
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sem Ligação Efetiva</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-amber-500">
                  {dashboardData.funnel.semLigacao + dashboardData.funnel.caixaPostal}
                </span>
                <span className="text-xs text-gray-400">
                  ({(((dashboardData.funnel.semLigacao + dashboardData.funnel.caixaPostal) / dashboardData.totalLeads) * 100).toFixed(1)}% dos leads)
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Inclui caixa postal/desligado
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Caixa Postal / Não Atendido</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-purple-500">{dashboardData.funnel.caixaPostal}</span>
                <span className="text-xs text-gray-400">
                  ({((dashboardData.funnel.caixaPostal / dashboardData.totalLeads) * 100).toFixed(1)}% dos leads)
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Chamadas ativas que caíram em caixa
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">% Desperdício Geral</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-blue-500">
                  {(( (dashboardData.totalLeads - dashboardData.contatos) / dashboardData.totalLeads ) * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-gray-400">de leads inúteis</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Contatos que nunca falaram com o SDR
              </p>
            </div>
          </div>

          {/* Highlight Banner */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6">
            <div className="text-5xl font-extrabold text-red-500 min-w-[120px] text-center md:text-left">
              {wasteRate}%
            </div>
            <div className="text-sm text-gray-300">
              <strong className="block text-white text-base mb-1">
                dos leads gerados nunca chegaram a conversar com o SDR IA
              </strong>
              Estes leads representam cadastros que caíram em caixa postal, telefones inválidos, ou que simplesmente desligaram antes de iniciar a conversa. Isso demonstra a urgência de qualificação no topo do funil (anúncios e formulários).
            </div>
          </div>

          {/* Platform & Region Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Region Breakdown table */}
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] bg-gray-500/5">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300">Não-Atendimento por Região</h3>
              </div>
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs uppercase bg-gray-500/10 text-gray-300">
                  <tr>
                    <th className="px-4 py-3">Região</th>
                    <th className="px-4 py-3 text-right">Leads Totais</th>
                    <th className="px-4 py-3 text-right">Sem Contato</th>
                    <th className="px-4 py-3 text-right">% Não Atenderam</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dashboardData.leadsPorRegiao).map(([reg, val]) => {
                    const pct = val.total > 0 ? ((val.semLigacao / val.total) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={reg} className="border-b border-[var(--border)]">
                        <td className="px-4 py-3 font-medium text-white">{reg}</td>
                        <td className="px-4 py-3 text-right">{val.total}</td>
                        <td className="px-4 py-3 text-right">{val.semLigacao}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-semibold">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Platform breakdown table */}
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] bg-gray-500/5">
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300">Não-Atendimento por Plataforma</h3>
              </div>
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs uppercase bg-gray-500/10 text-gray-300">
                  <tr>
                    <th className="px-4 py-3">Plataforma</th>
                    <th className="px-4 py-3 text-right">Leads Totais</th>
                    <th className="px-4 py-3 text-right">Sem Contato</th>
                    <th className="px-4 py-3 text-right">% Não Atenderam</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dashboardData.leadsPorPlataforma).map(([plat, val]) => {
                    const pct = val.total > 0 ? ((val.semLigacao / val.total) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={plat} className="border-b border-[var(--border)]">
                        <td className="px-4 py-3 font-medium text-white">{plat}</td>
                        <td className="px-4 py-3 text-right">{val.total}</td>
                        <td className="px-4 py-3 text-right">{val.semLigacao}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-semibold">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Campaign details table */}
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] bg-gray-500/5">
              <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300">Desempenho de Contato por Campanha</h3>
            </div>
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs uppercase bg-gray-500/10 text-gray-300">
                <tr>
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-4 py-3 text-right">Leads</th>
                  <th className="px-4 py-3 text-right">Sem Contato</th>
                  <th className="px-4 py-3 text-right">% Não Atenderam</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dashboardData.leadsPorCampanha).map(([camp, val]) => {
                  const pctVal = val.total > 0 ? (val.semLigacao / val.total) * 100 : 0
                  const pct = pctVal.toFixed(1)
                  let statusLabel = 'Crítico'
                  let statusClass = 'bg-red-500/15 text-red-500 border border-red-500/30'

                  if (pctVal < 30) {
                    statusLabel = 'Excelente'
                    statusClass = 'bg-green-500/15 text-green-500 border border-green-500/30'
                  } else if (pctVal < 50) {
                    statusLabel = 'Regular'
                    statusClass = 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/30'
                  }

                  return (
                    <tr key={camp} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3 font-medium text-white truncate max-w-[200px]" title={camp}>{camp}</td>
                      <td className="px-4 py-3 text-right">{val.total}</td>
                      <td className="px-4 py-3 text-right">{val.semLigacao}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-400">{pct}%</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusClass}`}>
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
        <div className="space-y-6">
          {/* Calls KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Ligações Realizadas</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-blue-500">{allCalls.length}</span>
                <span className="text-xs text-gray-400">tentativas totais</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Executadas pelo robô de voz
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Leads Contatados</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-green-500">{dashboardData.contatos}</span>
                <span className="text-xs text-gray-400">({contactRate}% de contatos)</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Leads que atenderam e falaram
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Média Ligações / Dia</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-purple-500">
                  {Object.keys(dashboardData.ligacoesPorDia).length > 0
                    ? (allCalls.length / Object.keys(dashboardData.ligacoesPorDia).length).toFixed(1)
                    : 0}
                </span>
                <span className="text-xs text-gray-400">ligações/dia</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Volume diário de prospecção
              </p>
            </div>

            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ligações Quentes</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold text-amber-500">{dashboardData.ligacoesQuentes.length}</span>
                <span className="text-xs text-gray-400">
                  ({((dashboardData.ligacoesQuentes.length / allCalls.length) * 100).toFixed(1)}% das chamadas)
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Score &ge; 5 ou agendadas
              </p>
            </div>
          </div>

          {/* Leads vs Calls Chart and Quality Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart */}
            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm lg:col-span-2 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">
                Leads Recebidos vs. Ligações Realizadas por Dia
              </h3>
              <div className="h-[280px]">
                <Line data={leadsVsCallsChartData} options={chartOptions} />
              </div>
            </div>

            {/* Quality Metrics */}
            <div className="bg-[var(--card-bg)] border border-[var(--border)] p-5 rounded-xl shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400 border-b border-[var(--border)] pb-3 mb-4">
                  Métricas de Qualidade das Chamadas
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-gray-300">Duração Média</span>
                    <span className="text-base font-bold text-blue-500">{dashboardData.duracao.media}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-gray-300">Duração Mediana</span>
                    <span className="text-base font-bold text-amber-500">{dashboardData.duracao.mediana}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
                    <span className="text-sm text-gray-300">Score Médio de Qualidade</span>
                    <span className="text-base font-bold text-green-500">
                      {(
                        Object.entries(dashboardData.scores).reduce((acc, [score, count]) => acc + parseInt(score) * count, 0) /
                        Math.max(1, Object.values(dashboardData.scores).reduce((a, b) => a + b, 0))
                      ).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-300">Conversão s/ Contatos</span>
                    <span className="text-base font-bold text-purple-500">{meetingRate}%</span>
                  </div>
                </div>
              </div>

              {/* Quality score summary */}
              <div className="mt-6 pt-4 border-t border-[var(--border)]">
                <div className="text-xs text-gray-400 text-center flex items-center justify-center gap-2">
                  <Award className="w-4 h-4 text-green-500" />
                  Score médio calculado sobre {Object.values(dashboardData.scores).reduce((a,b)=>a+b, 0)} leads qualificados
                </div>
              </div>
            </div>
          </div>

          {/* Hot calls table section */}
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm p-5 space-y-4">
            <div className="border-b border-[var(--border)] pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300">Ligações Mais Quentes &amp; Prospecção</h3>
                <p className="text-xs text-gray-400 mt-0.5">Leads com alto score ou agendamento para follow-up imediato</p>
              </div>
              <span className="text-xs font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30 px-3 py-1 rounded-full">
                {filteredHotCalls.length} identificadas
              </span>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome do lead ou palavra-chave no resumo da IA..."
                  value={hotSearchQuery}
                  onChange={(e) => setHotSearchQuery(e.target.value)}
                  className="w-full bg-[var(--ice)] border border-[var(--border)] rounded-lg text-sm pl-9 pr-4 py-2 focus:ring-2 focus:ring-accent/50 outline-none text-[var(--text)]"
                />
              </div>
              <select
                value={hotFilterClassification}
                onChange={(e) => setHotFilterClassification(e.target.value)}
                className="bg-[var(--ice)] border border-[var(--border)] rounded-lg text-sm px-4 py-2 focus:ring-2 focus:ring-accent/50 outline-none text-[var(--text)]"
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
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs uppercase bg-gray-500/10 text-gray-300">
                  <tr>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Data/Hora</th>
                    <th className="px-4 py-3 text-right">Duração</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3">Classificação</th>
                    <th className="px-4 py-3 max-w-sm">Resumo da Conversa (IA)</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHotCalls.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        Nenhuma ligação quente encontrada para os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredHotCalls.map((c, idx) => {
                      let tagClass = 'bg-gray-500/15 text-gray-400 border border-gray-500/30'
                      if (c.classificacao === 'Agendou Reunião') {
                        tagClass = 'bg-green-500/15 text-green-500 border border-green-500/30'
                      } else if (c.classificacao === 'Lead Qualificado') {
                        tagClass = 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                      } else if (c.classificacao === 'Retorno Agendado') {
                        tagClass = 'bg-purple-500/15 text-purple-500 border border-purple-500/30'
                      }

                      return (
                        <tr key={idx} className="border-b border-[var(--border)] hover:bg-gray-500/5 transition">
                          <td className="px-4 py-3 font-semibold text-white truncate max-w-[150px]" title={c.nome}>
                            {c.nome}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">{c.data_hora}</td>
                          <td className="px-4 py-3 text-right text-xs">{formatDuration(c.duracao)}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-amber-500">
                            {c.score !== null ? Number(c.score).toFixed(0) : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tagClass}`}>
                              {c.classificacao}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-300 max-w-md" title={c.resumo}>
                            <p className="line-clamp-2">{c.resumo}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {c.link_gravacao && (
                                <a
                                  href={c.link_gravacao}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Ouvir Gravação"
                                  className="p-1.5 bg-blue-500/15 hover:bg-blue-500 text-blue-500 hover:text-white rounded-lg transition"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {c.whatsapp_link && (
                                <a
                                  href={c.whatsapp_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Entrar em contato via WhatsApp"
                                  className="p-1.5 bg-green-500/15 hover:bg-green-500 text-green-500 hover:text-white rounded-lg transition"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
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
