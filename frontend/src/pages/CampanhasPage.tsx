import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { campanhasService } from '../services/campanhas'
import type { CampanhasResponse } from '../services/campanhas'
import {
  Megaphone,
  Search,
  Activity,
  PhoneCall,
  Users,
  Target,
  ArrowUpRight,
  BarChart3,
  Globe,
  Percent,
  CalendarCheck,
  Clock,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

// Register ChartJS components for Bar chart
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

export default function CampanhasPage() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState<CampanhasResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')

  const fetchCampaigns = () => {
    setLoading(true)
    campanhasService.getCampanhas()
      .then((data) => {
        setCampaigns(data || [])
        setError(null)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching campaigns:', err)
        setError('Erro ao carregar os dados das campanhas de marketing.')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  // Unique list of platforms for filter dropdown
  const platforms = useMemo(() => {
    const list = new Set<string>()
    campaigns.forEach((c) => {
      if (c.platform) {
        list.add(c.platform)
      }
    })
    return Array.from(list).sort()
  }, [campaigns])

  // Filter campaigns by search query and platform
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const name = (c.campaign_name || '').toLowerCase()
      const id = (c.campaign_id || '').toLowerCase()
      const query = searchQuery.toLowerCase().trim()

      const matchesSearch = !query || name.includes(query) || id.includes(query)
      const matchesPlatform = platformFilter === 'all' || c.platform === platformFilter

      return matchesSearch && matchesPlatform
    })
  }, [campaigns, searchQuery, platformFilter])

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalCampanhas = filteredCampaigns.length
    const totalLeads = filteredCampaigns.reduce((sum, c) => sum + (c.total_leads || 0), 0)
    const totalChamadas = filteredCampaigns.reduce((sum, c) => sum + (c.total_chamadas || 0), 0)
    const totalReunioes = filteredCampaigns.reduce((sum, c) => sum + (c.total_reunioes || 0), 0)
    const totalRetornos = filteredCampaigns.reduce((sum, c) => sum + (c.total_retornos || 0), 0)
    
    // Average calls per lead (percentage of interaction rate)
    const taxaContato = totalLeads > 0 ? (totalChamadas / totalLeads) * 100 : 0

    return { totalCampanhas, totalLeads, totalChamadas, totalReunioes, totalRetornos, taxaContato }
  }, [filteredCampaigns])

  // Setup data for Chart: Top 10 campaigns by lead volume
  const chartData = useMemo(() => {
    const topCampaigns = [...filteredCampaigns]
      .sort((a, b) => b.total_leads - a.total_leads)
      .slice(0, 10)

    const labels = topCampaigns.map((c) => c.campaign_name || c.campaign_id)
    const leadsData = topCampaigns.map((c) => c.total_leads)
    const chamadasData = topCampaigns.map((c) => c.total_chamadas)
    
    const isDark = document.documentElement.classList.contains('dark')

    return {
      labels,
      datasets: [
        {
          label: 'Leads Gerados',
          data: leadsData,
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.75)' : 'rgba(37, 99, 235, 0.75)', // Royal Blue
          borderColor: isDark ? '#3b82f6' : '#2563eb',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Chamadas Realizadas',
          data: chamadasData,
          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.75)' : 'rgba(79, 70, 229, 0.75)', // Indigo
          borderColor: isDark ? '#6366f1' : '#4f46e5',
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    }
  }, [filteredCampaigns])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#9ca3af',
          font: { family: 'Inter', size: 11 },
          boxWidth: 12,
        }
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
        ticks: { 
          color: '#9ca3af', 
          font: { family: 'Inter', size: 10 },
          maxRotation: 30,
          minRotation: 0,
        },
      },
      y: {
        grid: { color: 'rgba(156, 163, 175, 0.08)' },
        ticks: {
          color: '#9ca3af',
          font: { family: 'Inter', size: 10 },
        },
      },
    },
  }

  // Styled platform badge helper
  const getPlatformBadge = (platform: string) => {
    const formatted = (platform || '').toLowerCase().trim()
    
    if (formatted.includes('facebook') || formatted.includes('meta')) {
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-200/50'
    }
    if (formatted.includes('google')) {
      return 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200/50'
    }
    if (formatted.includes('instagram')) {
      return 'bg-pink-50 text-pink-700 dark:bg-pink-950/20 dark:text-pink-400 border border-pink-200/50'
    }
    if (formatted.includes('linkedin')) {
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400 border border-sky-200/50'
    }
    return 'bg-slate-50 text-slate-700 dark:bg-slate-800/20 dark:text-slate-300 border border-slate-200'
  }

  return (
    <div className="space-y-4 transition-colors duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-1.5">
            <Megaphone className="h-4 w-4 stroke-[1.5] text-[var(--text-secondary)]" />
            Desempenho de Campanhas
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Analise a captação por campanhas de marketing, taxas de engajamento e contatos telefônicos.
          </p>
        </div>
        <button
          onClick={fetchCampaigns}
          className="flex items-center gap-1.5 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm h-8 px-3 rounded-md transition-colors duration-150 animate-in fade-in"
        >
          <Activity className="h-4 w-4 stroke-[1.5] text-[var(--text-secondary)]" />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* KPI 1 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] block truncate">Total de Leads</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.totalLeads.toLocaleString('pt-BR')}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Leads gerados pelas campanhas</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
            <Users className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] block truncate">Chamadas Realizadas</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.totalChamadas.toLocaleString('pt-BR')}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Contatos telefônicos disparados</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
            <PhoneCall className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 3: Reuniões Agendadas */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] block truncate">Reuniões Agendadas</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.totalReunioes.toLocaleString('pt-BR')}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Reuniões marcadas na IA</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
            <CalendarCheck className="h-4 w-4 stroke-[1.5] text-emerald-500" />
          </div>
        </div>

        {/* KPI 4: Retornos Solicitados */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] block truncate">Retornos Solicitados</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.totalRetornos.toLocaleString('pt-BR')}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Pedidos de retorno marcados</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
            <Clock className="h-4 w-4 stroke-[1.5] text-indigo-500" />
          </div>
        </div>

        {/* KPI 5 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] block truncate">Taxa Média de Contato</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">
              {kpis.taxaContato.toFixed(1)}%
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">Chamadas em relação aos leads</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
            <Target className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 6 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] block truncate">Campanhas Filtradas</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.totalCampanhas}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Canais de captação ativos</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)] flex-shrink-0">
            <BarChart3 className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-lg space-y-3 transition-colors duration-150">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
            Volume de Captação vs. Chamadas (Top 10 Campanhas)
          </h3>
          <span className="text-[10px] text-[var(--text-secondary)] italic">
            Ordenado pelo volume de leads gerados
          </span>
        </div>
        <div className="h-[240px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--text-secondary)]">
              Carregando gráfico...
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--text-secondary)]">
              Nenhuma campanha para exibir no gráfico.
            </div>
          ) : (
            <Bar data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex flex-col md:flex-row gap-3 items-center transition-colors duration-150">
        {/* Search */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-[var(--text-tertiary)] stroke-[1.5]" />
          <input
            type="text"
            placeholder="Buscar campanha por nome ou identificador..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-8 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
          />
        </div>

        {/* Platform Filter */}
        <div className="relative w-full md:w-56">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="w-full h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
          >
            <option value="all">Todas as Plataformas</option>
            {platforms.map((plat) => (
              <option key={plat} value={plat}>
                {plat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Campaign Details Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="px-4 py-3">Campanha</th>
                <th className="px-4 py-3">Plataforma</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3 text-right">Chamadas</th>
                <th className="px-4 py-3 text-right">Reuniões</th>
                <th className="px-4 py-3 text-right">Retornos</th>
                <th className="px-4 py-3 text-center">Taxa de Contato / Engajamento</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                    <Activity className="h-5 w-5 animate-spin mx-auto mb-2 text-[var(--text-secondary)]" />
                    Carregando campanhas do sistema...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-red-500">
                    {error}
                  </td>
                </tr>
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                    Nenhuma campanha de marketing encontrada.
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((c) => {
                  const contatoRate = c.total_leads > 0 ? (c.total_chamadas / c.total_leads) * 100 : 0
                  
                  return (
                    <tr 
                      key={c.campaign_id} 
                      className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150"
                    >
                      {/* Name & ID */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-secondary)] flex-shrink-0 border border-[var(--border)]">
                            <Megaphone className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)] truncate max-w-[240px]" title={c.campaign_name}>
                              {c.campaign_name || 'Sem nome'}
                            </p>
                            <span className="text-[10px] text-[var(--text-tertiary)] block font-mono tracking-tight select-all">
                              ID: {c.campaign_id}
                            </span>
                          </div>
                        </div>
                      </td>
 
                      {/* Platform */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${getPlatformBadge(c.platform)}`}>
                          <Globe className="h-3 w-3 flex-shrink-0" />
                          {c.platform || 'Desconhecido'}
                        </span>
                      </td>
 
                      {/* Leads Count */}
                      <td className="px-4 py-3.5 text-right font-medium text-[var(--text-primary)]">
                        {c.total_leads.toLocaleString('pt-BR')}
                      </td>
 
                      {/* Calls Count */}
                      <td className="px-4 py-3.5 text-right font-medium text-[var(--text-primary)]">
                        {c.total_chamadas.toLocaleString('pt-BR')}
                      </td>

                      {/* Reuniões Count */}
                      <td className="px-4 py-3.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {(c.total_reunioes || 0).toLocaleString('pt-BR')}
                      </td>

                      {/* Retornos Count */}
                      <td className="px-4 py-3.5 text-right font-medium text-indigo-600 dark:text-indigo-400">
                        {(c.total_retornos || 0).toLocaleString('pt-BR')}
                      </td>
 
                      {/* Interaction Progress Bar */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-3 max-w-[200px] mx-auto">
                          <div className="w-full bg-[var(--surface-raised)] rounded-full h-1.5 border border-[var(--border)] overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                contatoRate > 75 
                                  ? 'bg-emerald-500' 
                                  : contatoRate > 40 
                                  ? 'bg-indigo-500' 
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(contatoRate, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-[var(--text-primary)] w-11 text-right flex-shrink-0 flex items-center justify-end">
                            {contatoRate.toFixed(0)}
                            <Percent className="h-2.5 w-2.5 text-[var(--text-secondary)] ml-0.5" />
                          </span>
                        </div>
                      </td>
 
                      {/* Actions */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => navigate(`/leads?campaign_id=${c.campaign_id}`)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface-raised)] hover:bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 rounded-md transition-all duration-150"
                        >
                          Ver Leads
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
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
  )
}
