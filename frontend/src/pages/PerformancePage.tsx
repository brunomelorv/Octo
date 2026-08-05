import { useState, useEffect, useMemo } from 'react'
import { negociosService } from '../services/negocios'
import type { KanbanStats } from '../services/negocios'
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
  Info,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  X
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

// Period options, shared by the filter buttons and the label written into the export.
const DATE_FILTER_OPTIONS = [
  { label: 'Tudo', value: 'all' },
  { label: 'Hoje', value: 'hoje' },
  { label: 'Ontem', value: 'ontem' },
  { label: 'Esta Semana', value: 'essa_semana' },
  { label: 'Semana Passada', value: 'semana_passada' },
  { label: 'Semana Retrasada', value: 'semana_retrasada' },
  { label: 'Este Mês', value: 'esse_mes' },
  { label: 'Personalizado', value: 'personalizado' },
]

/**
 * Extracts the YYYY-MM-DD part of a timestamp.
 *
 * Timestamps reach the front end in two shapes: ISO with a "T" (written by the API via
 * isoformat) and space separated (written by SQLite datetime(), which is what every row in
 * `chamadas` uses). Splitting on "T" alone left the whole timestamp in place for the second
 * shape, and the agenda endpoints then rejected it as an invalid date.
 */
function toDateOnly(value: string): string {
  return value.replace(' ', 'T').split('T')[0]
}

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

  // Kanban stage statistics
  const [kanbanStats, setKanbanStats] = useState<KanbanStats | null>(null)
  const [loadingKanban, setLoadingKanban] = useState(false)

  // Excel export
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

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

  // Extract unique operators for filtering, keyed by e-mail.
  // The e-mail is the identity: keying by name made the same person appear twice whenever the
  // recorded name and the name resolved from the users table differed (e.g. after a rename).
  const uniqueUsers = useMemo(() => {
    const byEmail = new Map<string, string>()
    history.forEach((item) => {
      const email = item.usuario_email
      if (!email) return
      if (!byEmail.has(email)) {
        byEmail.set(email, item.usuario_nome || email.split('@')[0])
      }
    })
    return Array.from(byEmail.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [history])

  // The agenda endpoints filter by operator NAME, so translate the selected e-mail.
  const selectedUserName = useMemo(() => {
    if (userFilter === 'all') return 'all'
    return uniqueUsers.find((u) => u.email === userFilter)?.name || userFilter
  }, [userFilter, uniqueUsers])

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

  // Get min date in history YYYY-MM-DD
  const minHistoryDateStr = useMemo(() => {
    let minDateStr: string | null = null
    for (const h of history) {
      const d = h.data_hora
      if (d && (!minDateStr || d < minDateStr)) minDateStr = d
    }
    if (minDateStr) {
      return toDateOnly(minDateStr)
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
    agendaService.getAgendaPerformance(startStr, endStr, selectedUserName)
      .then((data) => {
        // This endpoint answers HTTP 200 with {error: "..."} for a rejected date range, so a
        // truthy response is not enough — without `summary` the render below would throw and
        // take the whole page down.
        if (!data || !data.summary) {
          console.error('Resposta inesperada de agenda/performance:', data)
          setAgendaPerformance(null)
          return
        }
        setAgendaPerformance(data)
      })
      .catch((err) => {
        console.error('Error fetching agenda performance:', err)
        setAgendaPerformance(null)
      })
      .finally(() => {
        setLoadingAgendaPerf(false)
      })
  }, [dateRangeBounds, minHistoryDateStr, selectedUserName])

  // Fetch kanban stage statistics for the selected window and operator.
  // Only the "entered" figures react to the date filter; "current" is a snapshot by nature.
  useEffect(() => {
    setLoadingKanban(true)
    const params: { date_start?: string; date_end?: string; consultant_email?: string } = {}
    if (dateRangeBounds) {
      const { startStr, endStr } = getSelectedDateRangeStrings()
      params.date_start = startStr
      params.date_end = endStr
    }
    if (userFilter !== 'all') {
      params.consultant_email = userFilter
    }

    negociosService.getKanbanStats(params)
      .then((data) => setKanbanStats(data))
      .catch((err) => {
        console.error('Error fetching kanban stats:', err)
        setKanbanStats(null)
      })
      .finally(() => setLoadingKanban(false))
  }, [dateRangeBounds, minHistoryDateStr, userFilter])

  // Export the page summary as .xlsx, mirroring the active date and operator filters.
  const handleExportExcel = async () => {
    if (exporting) return
    setExporting(true)
    setExportError(null)
    try {
      const params: {
        date_start?: string
        date_end?: string
        consultant_email?: string
        period_label?: string
      } = {
        period_label:
          DATE_FILTER_OPTIONS.find((o) => o.value === dateFilter)?.label || 'Todo o período',
      }
      if (dateRangeBounds) {
        const { startStr, endStr } = getSelectedDateRangeStrings()
        params.date_start = startStr
        params.date_end = endStr
      }
      if (userFilter !== 'all') {
        params.consultant_email = userFilter
      }

      const { blob, filename } = await negociosService.exportPerformance(params)

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Released on the next tick so the download has already been handed to the browser.
      setTimeout(() => window.URL.revokeObjectURL(url), 0)
    } catch (err: any) {
      console.error('Erro ao exportar para Excel:', err)
      // The error body is a Blob because the request asked for one — read it back as text.
      let detail = 'Erro ao gerar o arquivo Excel. Tente novamente.'
      try {
        const data = err?.response?.data
        if (data instanceof Blob) {
          const parsed = JSON.parse(await data.text())
          if (parsed?.detail) detail = parsed.detail
        } else if (data?.detail) {
          detail = data.detail
        }
      } catch {
        // Keep the generic message.
      }
      setExportError(detail)
    } finally {
      setExporting(false)
    }
  }

  const handleCardClick = (type: 'total' | 'completed' | 'pending') => {
    const { startStr, endStr } = getSelectedDateRangeStrings()
    setSelectedCardType(type)
    setLoadingCardLeads(true)
    
    const statusMap = {
      total: 'all',
      completed: 'completed',
      pending: 'pending'
    }
    
    agendaService.getAgendaPerformanceLeads(startStr, endStr, selectedUserName, statusMap[type])
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
      const matchesUser = userFilter === 'all' || item.usuario_email === userFilter

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

    // Find the most active operator. Counted by e-mail so a rename does not split the tally
    // across two identities; the name is only used for display.
    const userCounts = new Map<string, { name: string; count: number }>()
    filteredHistory.forEach((item) => {
      const key = item.usuario_email || 'Sistema'
      const label = item.usuario_nome || 'Sistema'
      const entry = userCounts.get(key)
      if (entry) {
        entry.count += 1
      } else {
        userCounts.set(key, { name: label, count: 1 })
      }
    })

    let activeUser = 'Nenhum'
    let maxUpdates = 0
    userCounts.forEach(({ name, count }) => {
      if (count > maxUpdates) {
        maxUpdates = count
        activeUser = name
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
    // Matched by e-mail (the backend keys consultants by e-mail), not by display name.
    return consultantsPerformance.filter((c) => c.email === userFilter)
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
        <div className="flex items-center gap-2">
        <button
          onClick={fetchHistory}
          className="flex items-center gap-1.5 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm h-8 px-3 rounded-md transition-colors duration-150"
        >
          <Activity className="h-4 w-4 stroke-[1.5] text-[var(--text-secondary)]" />
          <span>Atualizar Histórico</span>
        </button>
        <button
          onClick={handleExportExcel}
          disabled={exporting}
          title="Exporta o resumo da página em .xlsx, respeitando o período e o operador selecionados"
          className="flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium h-8 px-3 rounded-md transition-colors duration-150 disabled:opacity-60"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
              <span>Gerando...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4 stroke-[1.5]" />
              <span>Exportar P/ Excel</span>
            </>
          )}
        </button>
        </div>
      </div>

      {exportError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="h-4 w-4 stroke-[1.5] shrink-0 mt-0.5" />
          <span className="flex-1">{exportError}</span>
          <button onClick={() => setExportError(null)} className="bg-transparent opacity-70 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Date & Vendedor Filter Panel */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 transition-colors duration-150">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="space-y-1.5 flex-1 w-full">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 stroke-[1.5]" />
              Filtrar por Período
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {DATE_FILTER_OPTIONS.map((btn) => (
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
                <option key={user.email} value={user.email}>
                  {user.name}
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

      {/* Kanban Stage Statistics */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 transition-colors duration-150">
        <div className="border-b border-[var(--border)] pb-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center">
              Estatísticas por Etapa do Kanban
              <InfoTooltip text="Atual = negócios que estão nessa coluna agora (retrato do funil, não depende do período). Entradas = negócios que entraram nessa coluna dentro do período selecionado." />
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Distribuição do funil por coluna, com o volume que entrou em cada etapa no período.
            </p>
          </div>
          {kanbanStats && (
            <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
              <span>
                Pipeline:{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {kanbanStats.summary.total_deals.toLocaleString('pt-BR')}
                </span>
              </span>
              <span>
                Taxa de ganho:{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {kanbanStats.summary.win_rate}%
                </span>
              </span>
            </div>
          )}
        </div>

        {loadingKanban ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-secondary)]">
            <Activity className="h-4 w-4 animate-spin stroke-[1.5]" />
            <span>Carregando estatísticas do kanban...</span>
          </div>
        ) : !kanbanStats || kanbanStats.summary.total_deals === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
            Nenhum negócio mapeado no kanban{userFilter !== 'all' ? ' para este operador' : ''}.
          </div>
        ) : (
          <>
            {/* Pipeline summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  label: 'Em Andamento',
                  value: kanbanStats.summary.em_andamento.toLocaleString('pt-BR'),
                  hint: 'Excluindo Ganho e Perdido',
                  tone: 'text-[var(--text-primary)]',
                },
                {
                  label: 'Ganhos',
                  value: kanbanStats.summary.ganhos.toLocaleString('pt-BR'),
                  hint: formatCurrency(kanbanStats.summary.ganhos_valor),
                  tone: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: 'Perdidos',
                  value: kanbanStats.summary.perdidos.toLocaleString('pt-BR'),
                  hint: 'Negócios encerrados sem venda',
                  tone: 'text-red-600 dark:text-red-400',
                },
                {
                  label: 'Valor Total',
                  value: formatCurrency(kanbanStats.summary.total_valor),
                  hint: 'Soma de todas as etapas',
                  tone: 'text-[var(--text-primary)]',
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-md p-3 space-y-0.5"
                >
                  <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                    {card.label}
                  </span>
                  <p className={`text-base font-semibold ${card.tone}`}>{card.value}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] truncate">{card.hint}</p>
                </div>
              ))}
            </div>

            {/* Per-stage breakdown */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    <th className="py-2 pr-3">Etapa</th>
                    <th className="py-2 px-3 text-right">Atual</th>
                    <th className="py-2 px-3">Distribuição</th>
                    <th className="py-2 px-3 text-right">Valor</th>
                    <th className="py-2 pl-3 text-right">Entradas no Período</th>
                  </tr>
                </thead>
                <tbody>
                  {kanbanStats.stages.map((s) => (
                    <tr
                      key={s.etapa}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-raised)] transition-colors duration-150"
                    >
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStageBadgeStyle(s.etapa)}`}
                        >
                          {s.etapa}
                        </span>
                        {s.unknown_stage && (
                          <span
                            className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400"
                            title="Etapa presente nos dados mas fora das colunas padrão do kanban"
                          >
                            fora do padrão
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[var(--text-primary)]">
                        {s.current.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                              style={{ width: `${Math.min(s.share, 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-[var(--text-secondary)] w-10 text-right shrink-0">
                            {s.share.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--text-primary)]">
                        {formatCurrency(s.valor)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <span className="font-medium text-[var(--text-primary)]">
                          {s.entered.toLocaleString('pt-BR')}
                        </span>
                        {s.entered > 0 && (
                          <span className="text-[11px] text-[var(--text-secondary)] ml-1">
                            ({s.entered_leads} lead{s.entered_leads === 1 ? '' : 's'})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-[var(--text-tertiary)]">
              "Atual" é um retrato do funil no momento e não muda com o filtro de período —
              apenas "Entradas no Período" responde às datas.
            </p>
          </>
        )}
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

        {agendaPerformance?.summary ? (
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
                  {userFilter !== 'all' && ` • Operador: ${selectedUserName}`}
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
