import { useState, useEffect, useMemo } from 'react'
import { negociosService } from '../services/negocios'
import { leadsService } from '../services/leads'
import { agendaService } from '../services/agenda'
import {
  Search,
  User,
  Calendar,
  ArrowRight,
  DollarSign,
  Users,
  Activity,
  ArrowUpDown,
  Info
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

// Tooltip component for KPI and performance cards
function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center ml-1">
      <Info className="w-3.5 h-3.5 text-[var(--text-tertiary)] stroke-[1.5] cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg p-2.5 text-[11px] text-[var(--text-secondary)] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-normal text-left font-normal normal-case">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--border)]"></div>
      </div>
    </div>
  )
}

// Register ChartJS components
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

interface HistoryEntry {
  id: number
  lead_id: string
  etapa_anterior: string
  etapa_nova: string
  valor: number
  usuario_email: string
  usuario_nome: string
  data_hora: string
  lead_name?: string
}

export default function PerformancePage() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [consultantsPerformance, setConsultantsPerformance] = useState<any[]>([])

  // Modal and details states
  const [selectedConsultant, setSelectedConsultant] = useState<{ name: string; email: string } | null>(null)
  const [consultantLeads, setConsultantLeads] = useState<any[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [modalTab, setModalTab] = useState<'agendados' | 'followup'>('agendados')

  // Date filters and Agenda Performance states
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [customDateStart, setCustomDateStart] = useState<string>('')
  const [customDateEnd, setCustomDateEnd] = useState<string>('')

  // Card leads states
  const [selectedCardType, setSelectedCardType] = useState<'total' | 'completed' | 'pending' | null>(null)
  const [cardLeads, setCardLeads] = useState<any[]>([])
  const [loadingCardLeads, setLoadingCardLeads] = useState(false)
  const [agendaPerformance, setAgendaPerformance] = useState<{
    daily: any[];
    summary: {
      total: number;
      completed: number;
      pending: number;
      completion_rate: number;
    };
  } | null>(null)
  const [loadingAgendaPerf, setLoadingAgendaPerf] = useState(false)

  useEffect(() => {
    if (!selectedConsultant) {
      setConsultantLeads([])
      return
    }
    setLoadingLeads(true)
    negociosService.getNegocios({ consultant: selectedConsultant.email })
      .then((data) => {
        setConsultantLeads(data || [])
      })
      .catch((err) => {
        console.error('Error fetching consultant leads:', err)
      })
      .finally(() => {
        setLoadingLeads(false)
      })
  }, [selectedConsultant])

  const { agendadosLeads, followUpLeads } = useMemo(() => {
    const agendados = consultantLeads.filter(l => l.etapa === 'Reunião Agendada')
    const followUp = consultantLeads.filter(l => l.etapa !== 'Reunião Agendada' && l.etapa !== 'Ganho' && l.etapa !== 'Perdido')
    return { agendadosLeads: agendados, followUpLeads: followUp }
  }, [consultantLeads])

  const fetchHistory = () => {
    setLoading(true)
    negociosService.getNegociosHistorico()
      .then((data) => {
        setHistory(data || [])
        setError(null)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching history:', err)
        setError('Erro ao carregar o histórico de performance de negócios.')
        setLoading(false)
      })
  }

  const fetchConsultants = () => {
    leadsService.getConsultantsPerformance()
      .then((data) => {
        setConsultantsPerformance(data)
      })
      .catch((err) => {
        console.error('Failed to load consultants performance:', err)
      })
  }

  useEffect(() => {
    fetchHistory()
    fetchConsultants()
  }, [])

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val)
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-'
    try {
      const cleanedStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T')
      const d = new Date(cleanedStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  const getStageBadgeStyle = (stage: string) => {
    switch (stage) {
      case 'Ganho':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50'
      case 'Reunião Agendada':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-200/50'
      case 'Qualificado':
        return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-200/50'
      case 'Perdido':
        return 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200/50'
      case 'Sem Contato':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50'
      default:
        return 'bg-slate-50 text-slate-700 dark:bg-slate-800/20 dark:text-slate-300 border border-slate-200'
    }
  }

  // Extract unique users for filtering
  const uniqueUsers = useMemo(() => {
    const users = new Set<string>()
    history.forEach((item) => {
      if (item.usuario_nome) {
        users.add(item.usuario_nome)
      }
    })
    return Array.from(users).sort()
  }, [history])

  // Calculate Reference Date (maximum date in dataset)
  const referenceDate = useMemo(() => {
    let maxDateStr: string | null = null
    for (const h of history) {
      const d = h.data_hora
      if (d && (!maxDateStr || d > maxDateStr)) maxDateStr = d
    }

    const refDate = new Date()
    if (maxDateStr) {
      const maxDatasetDate = new Date(maxDateStr.includes('T') ? maxDateStr : maxDateStr.replace(' ', 'T'))
      if (refDate.getTime() - maxDatasetDate.getTime() > 30 * 24 * 60 * 60 * 1000) {
        return maxDatasetDate
      }
    }
    return refDate
  }, [history])

  // Calculate Date Range bounds based on filter selection
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
    if (dateFilter === 'personalizado' && customDateStart && customDateEnd) {
      const s = new Date(customDateStart + 'T00:00:00')
      const e = new Date(customDateEnd + 'T23:59:59.999')
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s <= e) {
        return { start: s, end: e }
      }
    }

    return null
  }, [dateFilter, referenceDate, customDateStart, customDateEnd])

  // Get min date in history YYYY-MM-DD
  const minHistoryDateStr = useMemo(() => {
    let minDateStr: string | null = null
    for (const h of history) {
      const d = h.data_hora
      if (d && (!minDateStr || d < minDateStr)) minDateStr = d
    }
    if (minDateStr) {
      return minDateStr.split('T')[0]
    }
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  }, [history])

  // Helper to get selected date range strings
  const getSelectedDateRangeStrings = () => {
    let startStr = minHistoryDateStr
    let endStr = new Date().toISOString().split('T')[0]

    if (dateRangeBounds) {
      const formatLocalYYYYMMDD = (d: Date) => {
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      startStr = formatLocalYYYYMMDD(dateRangeBounds.start)
      endStr = formatLocalYYYYMMDD(dateRangeBounds.end)
    }
    return { startStr, endStr }
  }

  // Fetch Agenda Performance for selected date range and user filter
  useEffect(() => {
    const { startStr, endStr } = getSelectedDateRangeStrings()

    setLoadingAgendaPerf(true)
    agendaService.getAgendaPerformance(startStr, endStr, userFilter)
      .then((data) => {
        setAgendaPerformance(data)
      })
      .catch((err) => {
        console.error('Error fetching agenda performance:', err)
      })
      .finally(() => {
        setLoadingAgendaPerf(false)
      })
  }, [dateRangeBounds, minHistoryDateStr, userFilter])

  const handleCardClick = (type: 'total' | 'completed' | 'pending') => {
    const { startStr, endStr } = getSelectedDateRangeStrings()
    setSelectedCardType(type)
    setLoadingCardLeads(true)
    
    const statusMap = {
      total: 'all',
      completed: 'completed',
      pending: 'pending'
    }
    
    agendaService.getAgendaPerformanceLeads(startStr, endStr, userFilter, statusMap[type])
      .then((data) => {
        setCardLeads(data || [])
      })
      .catch((err) => {
        console.error('Error fetching card leads:', err)
      })
      .finally(() => {
        setLoadingCardLeads(false)
      })
  }

  // Filter history
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const name = (item.lead_name || '').toLowerCase()
      const user = (item.usuario_nome || '').toLowerCase()
      const email = (item.usuario_email || '').toLowerCase()
      const query = searchQuery.toLowerCase().trim()

      const matchesSearch = !query || name.includes(query) || user.includes(query) || email.includes(query)
      const matchesStage = stageFilter === 'all' || item.etapa_nova === stageFilter || item.etapa_anterior === stageFilter
      const matchesUser = userFilter === 'all' || item.usuario_nome === userFilter

      let matchesDate = true
      if (dateRangeBounds && item.data_hora) {
        const cleanedStr = item.data_hora.includes('T') ? item.data_hora : item.data_hora.replace(' ', 'T')
        const itemDate = new Date(cleanedStr)
        matchesDate = itemDate >= dateRangeBounds.start && itemDate <= dateRangeBounds.end
      }

      return matchesSearch && matchesStage && matchesUser && matchesDate
    })
  }, [history, searchQuery, stageFilter, userFilter, dateRangeBounds])

  // Calculate KPIs based on filtered history
  const kpis = useMemo(() => {
    const totalUpdates = filteredHistory.length
    const totalValueMoved = filteredHistory.reduce((sum, item) => sum + (item.valor || 0), 0)

    // Find the most active user
    const userCounts: { [key: string]: number } = {}
    filteredHistory.forEach((item) => {
      const u = item.usuario_nome || 'Sistema'
      userCounts[u] = (userCounts[u] || 0) + 1
    })

    let activeUser = 'Nenhum'
    let maxUpdates = 0
    Object.entries(userCounts).forEach(([u, count]) => {
      if (count > maxUpdates) {
        maxUpdates = count
        activeUser = u
      }
    })

    return { totalUpdates, totalValueMoved, activeUser, maxUpdates }
  }, [filteredHistory])

  // Setup agenda chart data
  const agendaChartData = useMemo(() => {
    if (!agendaPerformance || !agendaPerformance.daily) return null
    const isDark = document.documentElement.classList.contains('dark')
    const labels = agendaPerformance.daily.map(d => {
      const parts = d.date.split('-')
      if (parts.length === 3) return `${parts[2]}/${parts[1]}`
      return d.date
    })

    return {
      labels,
      datasets: [
        {
          label: 'Total Agendado',
          data: agendaPerformance.daily.map(d => d.total),
          backgroundColor: isDark ? 'rgba(129, 140, 248, 0.2)' : 'rgba(79, 70, 229, 0.1)',
          borderColor: isDark ? '#818cf8' : '#4f46e5',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
        },
        {
          label: 'Concluído',
          data: agendaPerformance.daily.map(d => d.completed),
          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
          borderColor: isDark ? '#10b981' : '#059669',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
        }
      ]
    }
  }, [agendaPerformance])

  const filteredConsultantsPerformance = useMemo(() => {
    if (userFilter === 'all') return consultantsPerformance
    return consultantsPerformance.filter(c => c.consultant === userFilter)
  }, [consultantsPerformance, userFilter])

  const consultantsChartData = useMemo(() => {
    const sorted = [...filteredConsultantsPerformance].sort((a, b) => b.leads_agendados - a.leads_agendados)
    const isDark = document.documentElement.classList.contains('dark')
    return {
      labels: sorted.map(c => c.consultant),
      datasets: [
        {
          label: 'Leads Agendados',
          data: sorted.map(c => c.leads_agendados),
          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.7)',
          borderRadius: 4,
        },
        {
          label: 'Em Follow-up',
          data: sorted.map(c => c.leads_follow_up),
          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.8)' : 'rgba(245, 158, 11, 0.7)',
          borderRadius: 4,
        }
      ]
    }
  }, [filteredConsultantsPerformance])

  // Chart Setup: calculate quantity of updates/changes per day
  const dailyChangesChartData = useMemo(() => {
    const changesCountByDate: { [key: string]: number } = {}

    // Group items from filteredHistory by date (YYYY-MM-DD)
    filteredHistory.forEach((item) => {
      if (!item.data_hora) return
      const dateStr = item.data_hora.split('T')[0]
      changesCountByDate[dateStr] = (changesCountByDate[dateStr] || 0) + 1
    })

    // Chronologically sorted dates
    const sortedDates = Object.keys(changesCountByDate).sort()

    // Format labels as DD/MM
    const labels = sortedDates.map((d) => {
      const parts = d.split('-')
      if (parts.length === 3) return `${parts[2]}/${parts[1]}`
      return d
    })

    const dataSeries = sortedDates.map((d) => changesCountByDate[d])
    const isDark = document.documentElement.classList.contains('dark')

    return {
      labels,
      datasets: [
        {
          label: 'Mudanças de Etapas',
          data: dataSeries,
          borderColor: isDark ? '#3b82f6' : '#2563eb', // Nice brand blue color
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.05)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: isDark ? '#3b82f6' : '#2563eb',
          tension: 0.15,
          fill: true,
        }
      ]
    }
  }, [filteredHistory])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
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
        ticks: {
          color: '#9ca3af',
          font: { family: 'Inter', size: 10 },
          precision: 0,
          stepSize: 1
        },
      },
    },
  }

  return (
    <div className="space-y-4 transition-colors duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">Performance Comercial</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Acompanhe o histórico de alterações dos cards de negócios e o desempenho do pipeline.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-1.5 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm h-8 px-3 rounded-md transition-colors duration-150"
        >
          <Activity className="h-4 w-4 stroke-[1.5] text-[var(--text-secondary)]" />
          <span>Atualizar Histórico</span>
        </button>
      </div>

      {/* Date & Vendedor Filter Panel */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 transition-colors duration-150">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="space-y-1.5 flex-1 w-full">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 stroke-[1.5]" />
              Filtrar por Período
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {[
                { label: 'Tudo', value: 'all' },
                { label: 'Hoje', value: 'hoje' },
                { label: 'Ontem', value: 'ontem' },
                { label: 'Esta Semana', value: 'essa_semana' },
                { label: 'Semana Passada', value: 'semana_passada' },
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
                <div className="flex items-center gap-1.5 ml-1 animate-in fade-in duration-200">
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

          <div className="space-y-1.5 w-full md:w-64 shrink-0">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 stroke-[1.5]" />
              Vendedor / Operador
            </span>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150 cursor-pointer"
            >
              <option value="all">Todos Operadores</option>
              {uniqueUsers.map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
              Total de Movimentações
              <InfoTooltip text="Quantidade de transições de etapas de leads realizadas no período." />
            </span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.totalUpdates}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Alterações registradas</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <ArrowUpDown className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
              Volume Total Mapeado
              <InfoTooltip text="Soma dos valores monetários dos leads movimentados no período." />
            </span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{formatCurrency(kpis.totalValueMoved)}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Valor acumulado no histórico</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <DollarSign className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center">
              Operador Mais Ativo
              <InfoTooltip text="Operador comercial que realizou o maior número de ações no período." />
            </span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-[180px]">{kpis.activeUser}</h3>
            <p className="text-xs text-[var(--text-secondary)]">{kpis.maxUpdates} ações registradas</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <Users className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>
      </div>

      {/* Daily Agenda Performance Section */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 transition-colors duration-150">
        <div className="border-b border-[var(--border)] pb-2.5 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              Performance de Agenda do Dia
            </h3>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Acompanhamento de retornos, tarefas e reuniões no período selecionado.
            </p>
          </div>
          {loadingAgendaPerf && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
          )}
        </div>

        {agendaPerformance ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Agenda Stats */}
            <div className="space-y-4 flex flex-col justify-between">
              <div className="grid grid-cols-2 gap-3">
                {/* Total Agendados Card */}
                <button
                  onClick={() => handleCardClick('total')}
                  className="bg-[var(--surface-raised)] border border-[var(--border)] p-3 rounded-lg flex flex-col justify-between hover:border-[var(--accent)] hover:bg-[var(--surface)] transition-all duration-150 text-left w-full group cursor-pointer"
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] uppercase font-semibold text-[var(--text-secondary)]">Agendamentos</span>
                    <InfoTooltip text="Total de retornos, tarefas e reuniões agendadas para o período." />
                  </div>
                  <div className="flex justify-between items-end w-full mt-1">
                    <h4 className="text-2xl font-bold text-[var(--text-primary)]">{agendaPerformance.summary.total}</h4>
                    <span className="text-[9px] text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity font-medium">Ver Leads &rarr;</span>
                  </div>
                </button>

                {/* Completed Card */}
                <button
                  onClick={() => handleCardClick('completed')}
                  className="bg-[var(--surface-raised)] border border-[var(--border)] p-3 rounded-lg flex flex-col justify-between hover:border-[var(--accent)] hover:bg-[var(--surface)] transition-all duration-150 text-left w-full group cursor-pointer"
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] uppercase font-semibold text-[var(--text-secondary)]">Concluídos</span>
                    <InfoTooltip text="Compromissos concluídos/realizados no período." />
                  </div>
                  <div className="flex justify-between items-end w-full mt-1">
                    <h4 className="text-2xl font-bold text-emerald-600">{agendaPerformance.summary.completed}</h4>
                    <span className="text-[9px] text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity font-medium">Ver Leads &rarr;</span>
                  </div>
                </button>

                {/* Pending Card */}
                <button
                  onClick={() => handleCardClick('pending')}
                  className="bg-[var(--surface-raised)] border border-[var(--border)] p-3 rounded-lg flex flex-col justify-between hover:border-[var(--accent)] hover:bg-[var(--surface)] transition-all duration-150 text-left w-full group cursor-pointer"
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] uppercase font-semibold text-[var(--text-secondary)]">Pendentes</span>
                    <InfoTooltip text="Compromissos que ainda não foram concluídos ou estão aguardando contato." />
                  </div>
                  <div className="flex justify-between items-end w-full mt-1">
                    <h4 className="text-2xl font-bold text-amber-600">{agendaPerformance.summary.pending}</h4>
                    <span className="text-[9px] text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity font-medium">Ver Leads &rarr;</span>
                  </div>
                </button>

                {/* Completion Rate Card */}
                <div className="bg-[var(--surface-raised)] border border-[var(--border)] p-3 rounded-lg flex flex-col justify-between">
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] uppercase font-semibold text-[var(--text-secondary)]">Taxa Conclusão</span>
                    <InfoTooltip text="Percentual de compromissos concluídos em relação ao total agendado." />
                  </div>
                  <h4 className="text-2xl font-bold text-[var(--text-primary)] mt-1">{agendaPerformance.summary.completion_rate}%</h4>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1 bg-[var(--surface-raised)] border border-[var(--border)] p-3 rounded-lg">
                <div className="flex justify-between text-[11px] font-medium text-[var(--text-secondary)]">
                  <span>Progresso de Conclusão</span>
                  <span>{agendaPerformance.summary.completion_rate}%</span>
                </div>
                <div className="h-2 w-full bg-[var(--border)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${agendaPerformance.summary.completion_rate}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Agenda Chart */}
            <div className="lg:col-span-2 h-[200px]">
              {agendaChartData ? (
                <Line 
                  data={agendaChartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { 
                        position: 'top' as const,
                        labels: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', font: { family: 'Inter', size: 10 } } 
                      },
                      tooltip: {
                        padding: 8,
                        titleFont: { family: 'Inter', size: 11, weight: 'bold' },
                        bodyFont: { family: 'Inter', size: 10 },
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' },
                        ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', precision: 0 }
                      },
                      x: {
                        grid: { display: false },
                        ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b' }
                      }
                    }
                  }} 
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[var(--text-tertiary)]">
                  Sem dados para exibir
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-[var(--text-tertiary)]">
            Nenhum dado de agenda disponível para o período selecionado.
          </div>
        )}
      </div>

      {/* Consultants Performance Section */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4 transition-colors duration-150">
        <div className="border-b border-[var(--border)] pb-2.5">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
            Performance por Consultor
          </h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  <th className="px-4 py-2.5">Consultor</th>
                  <th className="px-4 py-2.5 text-right">Total Leads</th>
                  <th className="px-4 py-2.5 text-right">Agendados</th>
                  <th className="px-4 py-2.5 text-right">Follow-up</th>
                  <th className="px-4 py-2.5 text-right">% Conversão</th>
                </tr>
              </thead>
              <tbody>
                {filteredConsultantsPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-secondary)] text-xs">
                      Nenhum dado encontrado para performance de consultores.
                    </td>
                  </tr>
                ) : (
                  filteredConsultantsPerformance.map((c, idx) => (
                    <tr key={idx} className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setSelectedConsultant({ name: c.consultant, email: c.email || '' })}
                          className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors text-left flex items-center gap-1 group"
                        >
                          <span>{c.consultant}</span>
                          <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--surface-raised)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--text-tertiary)] font-normal ml-1">
                            Ver Leads
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">{c.total_leads}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">
                        <button
                          onClick={() => {
                            setSelectedConsultant({ name: c.consultant, email: c.email || '' })
                            setModalTab('agendados')
                          }}
                          className="hover:underline font-semibold"
                        >
                          {c.leads_agendados}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right text-amber-600 font-medium">
                        <button
                          onClick={() => {
                            setSelectedConsultant({ name: c.consultant, email: c.email || '' })
                            setModalTab('followup')
                          }}
                          className="hover:underline font-semibold"
                        >
                          {c.leads_follow_up}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[var(--text-primary)]">{c.conversion_rate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="h-[350px]">
            <Bar
              data={consultantsChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'top', labels: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b' } }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    grid: { color: document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b' }
                  },
                  x: {
                    grid: { display: false },
                    ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b' }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Changes Per Day Chart */}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg space-y-3 transition-colors duration-150">
        <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
          Mudanças de Negócios Realizadas por Dia
        </h3>
        <div className="h-[200px]">
          <Line data={dailyChangesChartData} options={chartOptions} />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex flex-col md:flex-row gap-3 items-center transition-colors duration-150">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-[var(--text-tertiary)] stroke-[1.5]" />
          <input
            type="text"
            placeholder="Buscar por lead ou operador comercial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-8 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
          />
        </div>

        <div className="relative w-full md:w-48">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="w-full h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
          >
            <option value="all">Todas as Etapas / Ações</option>
            <option value="Sem Contato">Sem Contato</option>
            <option value="Contatado">Contatado</option>
            <option value="Qualificado">Qualificado</option>
            <option value="Reunião Agendada">Reunião Agendada</option>
            <option value="KYC/COF/Contrato">KYC/COF/Contrato</option>
            <option value="Ganho">Ganho</option>
            <option value="Perdido">Perdido</option>
            <option value="Tag: Tarefa">Ação: Tarefa</option>
            <option value="Tag: Chamada">Ação: Chamada</option>
            <option value="Tag: Reunião Realizada">Ação: Reunião Realizada</option>
            <option value="Agenda Concluída">Agenda Concluída</option>
            <option value="Agenda Reagendada">Agenda Reagendada</option>
            <option value="Anotação">Anotações Gerais</option>
          </select>
        </div>
      </div>

      {/* Performance Audit Trail Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
            <span className="text-xs text-[var(--text-secondary)]">Carregando histórico de performance...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-500 font-semibold text-sm">{error}</p>
            <button
              onClick={fetchHistory}
              className="mt-4 h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium rounded-md transition-colors duration-150"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-secondary)] text-sm">
            Nenhuma alteração de negócios encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] bg-[var(--surface-raised)]">
                  <th className="px-4 py-3">Lead / Negócio</th>
                  <th className="px-4 py-3">Operador</th>
                  <th className="px-4 py-3">Transição de Etapa</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150">
                    {/* Lead */}
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                      {item.lead_name || 'Lead Excluído'}
                    </td>
                    {/* Operator */}
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-[var(--text-tertiary)] stroke-[1.5]" />
                        <span>{item.usuario_nome || 'Sistema'}</span>
                      </div>
                      <span className="text-[10px] block text-[var(--text-tertiary)]">{item.usuario_email}</span>
                    </td>
                    {/* Transition */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStageBadgeStyle(item.etapa_anterior || 'Novo')}`}>
                          {item.etapa_anterior || 'Novo'}
                        </span>
                        <ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" />
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStageBadgeStyle(item.etapa_nova)}`}>
                          {item.etapa_nova}
                        </span>
                      </div>
                    </td>
                    {/* Value */}
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-450">
                      {item.valor > 0 ? formatCurrency(item.valor) : '-'}
                    </td>
                    {/* DateTime */}
                    <td className="px-4 py-3 text-right text-xs text-[var(--text-secondary)] whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)] stroke-[1.5]" />
                        <span>{formatDate(item.data_hora)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Leads do Consultor */}
      {selectedConsultant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full max-w-4xl bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Leads de {selectedConsultant.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {selectedConsultant.email || 'Sem e-mail cadastrado'}
                </p>
              </div>
              <button 
                onClick={() => setSelectedConsultant(null)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1.5 rounded-lg hover:bg-[var(--surface-raised)]"
              >
                <span className="text-lg font-bold">✕</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] bg-[var(--surface-raised)] px-4">
              <button
                onClick={() => setModalTab('agendados')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-all ${
                  modalTab === 'agendados'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Reuniões Agendadas ({loadingLeads ? '...' : agendadosLeads.length})
              </button>
              <button
                onClick={() => setModalTab('followup')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-all ${
                  modalTab === 'followup'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Leads em Follow-up ({loadingLeads ? '...' : followUpLeads.length})
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 bg-[var(--surface-raised)]/20">
              {loadingLeads ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
                  <span className="text-sm text-[var(--text-secondary)]">Carregando leads do consultor...</span>
                </div>
              ) : (
                <>
                  {modalTab === 'agendados' && (
                    <div className="space-y-3">
                      {agendadosLeads.length === 0 ? (
                        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
                          Nenhum lead com Reunião Agendada para este consultor.
                        </div>
                      ) : (
                        agendadosLeads.map((lead) => (
                          <LeadItemRow key={lead.id} lead={lead} />
                        ))
                      )}
                    </div>
                  )}

                  {modalTab === 'followup' && (
                    <div className="space-y-3">
                      {followUpLeads.length === 0 ? (
                        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
                          Nenhum lead em etapa de acompanhamento (follow-up) para este consultor.
                        </div>
                      ) : (
                        followUpLeads.map((lead) => (
                          <LeadItemRow key={lead.id} lead={lead} />
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-[var(--border)] bg-[var(--surface-raised)] rounded-b-xl">
              <button
                onClick={() => setSelectedConsultant(null)}
                className="h-9 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium rounded-md transition-colors duration-150"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Leads do Card de Performance de Agenda */}
      {selectedCardType && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedCardType(null)}
        >
          <div 
            className="w-full max-w-4xl bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Leads - {selectedCardType === 'total' ? 'Agendamentos' : selectedCardType === 'completed' ? 'Concluídos' : 'Pendentes'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Período: {
                    dateFilter === 'all' ? 'Todo Período' :
                    dateFilter === 'hoje' ? 'Hoje' :
                    dateFilter === 'ontem' ? 'Ontem' :
                    dateFilter === 'essa_semana' ? 'Esta Semana' :
                    dateFilter === 'semana_passada' ? 'Semana Passada' :
                    dateFilter === 'esse_mes' ? 'Este Mês' :
                    dateFilter === 'personalizado' ? `${customDateStart.split('-').reverse().join('/')} até ${customDateEnd.split('-').reverse().join('/')}` :
                    dateFilter
                  }
                  {userFilter !== 'all' && ` • Operador: ${userFilter}`}
                </p>
              </div>
              <button 
                onClick={() => setSelectedCardType(null)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1.5 rounded-lg hover:bg-[var(--surface-raised)]"
              >
                <span className="text-lg font-bold">✕</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 bg-[var(--surface-raised)]/20">
              {loadingCardLeads ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
                  <span className="text-sm text-[var(--text-secondary)]">Carregando leads...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {cardLeads.length === 0 ? (
                    <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
                      Nenhum lead encontrado para esta categoria no período.
                    </div>
                  ) : (
                    cardLeads.map((lead) => (
                      <LeadItemRow key={lead.chamada_id || lead.id || lead.phone} lead={lead} />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-[var(--border)] bg-[var(--surface-raised)] rounded-b-xl">
              <button
                onClick={() => setSelectedCardType(null)}
                className="h-9 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium rounded-md transition-colors duration-150"
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

function LeadItemRow({ lead }: { lead: any }) {
  const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '') : ''
  const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : null

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val)
  }

  const getStageBadgeStyle = (stage: string) => {
    switch (stage) {
      case 'Reunião Agendada':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-200/50'
      case 'Qualificado':
        return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-200/50'
      case 'Contatado':
        return 'bg-slate-50 text-slate-700 dark:bg-slate-800/20 dark:text-slate-300 border border-slate-200'
      default:
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50'
    }
  }

  return (
    <div className="p-4 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/50 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-150 shadow-sm">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[var(--text-primary)]">{lead.full_name}</span>
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStageBadgeStyle(lead.etapa)}`}>
            {lead.etapa || 'Sem Contato'}
          </span>
        </div>
        <div className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-x-4 gap-y-1">
          <span>Telefone: {lead.phone}</span>
          {lead.email && <span>E-mail: {lead.email}</span>}
          {lead.city && <span>Cidade: {lead.city}</span>}
        </div>
        {lead.campaign_name && (
          <div className="text-[10px] text-[var(--text-tertiary)]">
            Campanha: {lead.campaign_name}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
        {lead.valor > 0 && (
          <div className="text-right mr-2">
            <div className="text-[10px] text-[var(--text-tertiary)]">Valor Estimado</div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(lead.valor)}</div>
          </div>
        )}
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.852.002-2.63-1.023-5.101-2.884-6.963C16.59 1.928 14.12 1.101 11.493 1.1c-5.44 0-9.866 4.418-9.87 9.851-.001 1.716.453 3.39 1.316 4.873L1.936 21.8l6.11-1.604z" />
            </svg>
            WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
