import { useState, useEffect, useMemo } from 'react'
import { negociosService } from '../services/negocios'
import {
  Search,
  User,
  Calendar,
  ArrowRight,
  DollarSign,
  Users,
  Activity,
  ArrowUpDown
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

// Register ChartJS components
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

  useEffect(() => {
    fetchHistory()
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

      return matchesSearch && matchesStage && matchesUser
    })
  }, [history, searchQuery, stageFilter, userFilter])

  // Calculate KPIs based on full loaded history
  const kpis = useMemo(() => {
    const totalUpdates = history.length
    const totalValueMoved = history.reduce((sum, item) => sum + (item.valor || 0), 0)

    // Find the most active user
    const userCounts: { [key: string]: number } = {}
    history.forEach((item) => {
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
  }, [history])

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

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Total de Movimentações</span>
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
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Volume Total Mapeado</span>
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
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Operador Mais Ativo</span>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-[180px]">{kpis.activeUser}</h3>
            <p className="text-xs text-[var(--text-secondary)]">{kpis.maxUpdates} ações registradas</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <Users className="h-4 w-4 stroke-[1.5]" />
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
            <option value="all">Todas as Etapas</option>
            <option value="Novo">Novo</option>
            <option value="Sem Contato">Sem Contato</option>
            <option value="Contatado">Contatado</option>
            <option value="Qualificado">Qualificado</option>
            <option value="Reunião Agendada">Reunião Agendada</option>
            <option value="KYC/COF/Contrato">KYC/COF/Contrato</option>
            <option value="Ganho">Ganho</option>
            <option value="Perdido">Perdido</option>
          </select>
        </div>

        <div className="relative w-full md:w-48">
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="w-full h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
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
    </div>
  )
}
