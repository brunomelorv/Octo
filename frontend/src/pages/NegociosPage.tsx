import { useState, useEffect, useMemo } from 'react'
import { negociosService } from '../services/negocios'
import type { Negocio } from '../services/negocios'
import { campanhasService } from '../services/campanhas'
import type { CampanhasResponse } from '../services/campanhas'
import { leadsService } from '../services/leads'
import type { LeadWithCalls, Call } from '../types/lead'
import {
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Award,
  Calendar,
  X,
  Phone,
  Smartphone,
  Mail,
  MapPin,
  ExternalLink,
  MessageSquare,
  Volume2,
  Star,
  Eye,
  Edit2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react'

// Constants for Kanban Stages
const COLUMNS = [
  { id: 'Novo', name: 'Novo', color: 'border-t-sky-500 dark:border-t-sky-400 bg-sky-50/20 dark:bg-sky-950/5 text-sky-700 dark:text-sky-400' },
  { id: 'Sem Contato', name: 'Sem Contato', color: 'border-t-slate-400 dark:border-t-slate-500 bg-slate-50/20 dark:bg-slate-950/5 text-slate-600 dark:text-slate-400' },
  { id: 'Contatado', name: 'Contatado', color: 'border-t-amber-500 dark:border-t-amber-400 bg-amber-50/20 dark:bg-amber-950/5 text-amber-700 dark:text-amber-400' },
  { id: 'Qualificado', name: 'Qualificado', color: 'border-t-indigo-500 dark:border-t-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/5 text-indigo-700 dark:text-indigo-400' },
  { id: 'Reunião Agendada', name: 'Reunião Agendada', color: 'border-t-violet-500 dark:border-t-violet-400 bg-violet-50/20 dark:bg-violet-950/5 text-violet-700 dark:text-violet-400' },
  { id: 'KYC/COF/Contrato', name: 'KYC/COF/Contrato', color: 'border-t-pink-500 dark:border-t-pink-400 bg-pink-50/20 dark:bg-pink-950/5 text-pink-700 dark:text-pink-400' },
  { id: 'Ganho', name: 'Ganho', color: 'border-t-emerald-500 dark:border-t-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/5 text-emerald-700 dark:text-emerald-400' },
  { id: 'Perdido', name: 'Perdido', color: 'border-t-red-500 dark:border-t-red-400 bg-red-50/20 dark:bg-red-950/5 text-red-700 dark:text-red-400' }
]

// Helper to format currency
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val)
}

// Helper to format date strings
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

// Helper to format only date (no time)
const formatDateOnly = (dateStr?: string | null) => {
  if (!dateStr) return '-'
  try {
    const cleanedStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T')
    const d = new Date(cleanedStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

// Helper to format duration in seconds
const formatDuration = (seconds?: number | null) => {
  if (seconds === undefined || seconds === null) return '-'
  if (seconds === 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Helper to get color classes for call status badge
const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'Agendou Reunião':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40'
    case 'Lead Qualificado':
      return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40'
    case 'Sem Contato Efetivo':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40'
    case 'Caixa Postal / Não Atendido':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50'
    case 'Sem Interesse':
      return 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900/40'
    case 'Lead Desqualificado':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border border-orange-200 dark:border-orange-900/40'
    case 'Sem Ligação':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-200 dark:border-sky-900/40'
    default:
      return 'bg-slate-50 text-slate-700 border border-slate-200'
  }
}

// Helper to classify call on client
function classifyCall(call: Call) {
  const resumo = (call.resumo_ligacao || '').toLowerCase()
  const tag = (call.tag || '').toLowerCase()
  const dur = call.duracao_segundos || 0
  const reuniao = call.reuniao_agendada

  if (reuniao && String(reuniao).toLowerCase() !== 'none' && String(reuniao).trim() !== '') {
    return { classif: 'Agendou Reunião', subcat: 'Qualificado / Agendou reunião', score: 8 }
  }
  if (resumo.includes('{lead quente}') || tag.includes('lead quente') || resumo.includes('reunião foi agendada')) {
    return { classif: 'Lead Qualificado', subcat: 'Qualificado / Agendou reunião', score: 7 }
  }
  if (resumo.includes('caixa postal') || resumo.includes('não atendido') || tag.includes('caixa postal')) {
    return { classif: 'Caixa Postal / Não Atendido', subcat: 'Caixa Postal / Não Atendido', score: 2 }
  }
  if (dur > 0 && dur < 15) {
    return { classif: 'Caixa Postal / Não Atendido', subcat: 'Ligação Curta / Sem Diálogo', score: 2 }
  }
  if (resumo.includes('ligar depois') || resumo.includes('retornar mais tarde') || resumo.includes('ligar mais tarde')) {
    return { classif: 'Sem Contato Efetivo', subcat: 'Pediu para Ligar Depois', score: 4 }
  }
  if (resumo.includes('avaliando internamente') || resumo.includes('avaliar com o sócio')) {
    return { classif: 'Sem Contato Efetivo', subcat: 'Avaliando Internamente', score: 5 }
  }
  if (resumo.includes('desqualificado') || resumo.includes('{lead desqualificado}') || resumo.includes('fora do perfil')) {
    return { classif: 'Lead Desqualificado', subcat: 'Fora do Perfil de Cliente Ideal', score: 1 }
  }
  if (resumo.includes('não tem interesse') || resumo.includes('sem interesse') || resumo.includes('recusa')) {
    return { classif: 'Sem Interesse', subcat: 'Recusa Direta / Sem Interesse', score: 3 }
  }
  if (resumo.includes('hostil') || resumo.includes('irritado')) {
    return { classif: 'Sem Interesse', subcat: 'Lead Hostil / Irritado', score: 1 }
  }
  if (dur >= 30) {
    return { classif: 'Lead Qualificado', subcat: 'Qualificado / Agendou reunião', score: 6 }
  } else if (dur > 0) {
    return { classif: 'Sem Contato Efetivo', subcat: 'Avaliando Internamente', score: 4 }
  }
  return { classif: 'Caixa Postal / Não Atendido', subcat: 'Caixa Postal / Não Atendido', score: 2 }
}

export default function NegociosPage() {
  const [deals, setDeals] = useState<Negocio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [campaigns, setCampaigns] = useState<CampanhasResponse[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Editing values
  const [editingDealId, setEditingDealId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  // Details drawer
  const [selectedLead, setSelectedLead] = useState<LeadWithCalls | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Drag and drop state
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null)

  // Search input debounce handler
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 450)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Fetch campaigns on mount
  useEffect(() => {
    campanhasService.getCampanhas()
      .then((data) => {
        setCampaigns(data || [])
      })
      .catch((err) => {
        console.error('Error fetching campaigns:', err)
      })
  }, [])

  // Fetch deals (negocios)
  const fetchDeals = () => {
    setLoading(true)
    negociosService.getNegocios({
      campaign_id: selectedCampaign !== 'all' ? selectedCampaign : undefined,
      search: debouncedSearch ? debouncedSearch : undefined
    })
      .then((data) => {
        setDeals(data || [])
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching deals:', err)
        setError('Erro ao carregar o funil de negócios.')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchDeals()
  }, [selectedCampaign, debouncedSearch])

  // Native drag & drop handlers
  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('text/plain', dealId)
    setDraggedDealId(dealId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault()
    const dealId = e.dataTransfer.getData('text/plain') || draggedDealId
    if (!dealId) return

    const deal = deals.find((d) => d.id === dealId)
    if (!deal || deal.etapa === targetStage) return

    // Optimistic UI Update
    const previousDeals = [...deals]
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, etapa: targetStage, updated_at: new Date().toISOString() } : d))
    )

    // Send PUT request to backend
    negociosService.updateNegocio(dealId, {
      etapa: targetStage,
      valor: deal.valor || 0
    }).catch((err) => {
      console.error('Failed to move deal stage:', err)
      setDeals(previousDeals) // Rollback on error
    })

    setDraggedDealId(null)
  }

  // Quick arrow stage mover
  const moveDealStage = (deal: Negocio, direction: 'left' | 'right') => {
    const currentIndex = COLUMNS.findIndex((c) => c.id === deal.etapa)
    if (currentIndex === -1) return

    let nextIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
    if (nextIndex < 0 || nextIndex >= COLUMNS.length) return

    const targetStage = COLUMNS[nextIndex].id

    // Optimistic Update
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, etapa: targetStage, updated_at: new Date().toISOString() } : d))
    )

    negociosService.updateNegocio(deal.id, {
      etapa: targetStage,
      valor: deal.valor || 0
    }).catch((err) => {
      console.error('Failed to update stage:', err)
      fetchDeals() // Full reload on error
    })
  }

  // Value edit handlers
  const handleStartEditValue = (deal: Negocio, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingDealId(deal.id)
    setEditingValue(String(deal.valor || ''))
  }

  const handleSaveValue = (deal: Negocio) => {
    const numValue = parseFloat(editingValue) || 0
    if (deal.valor === numValue) {
      setEditingDealId(null)
      return
    }

    // Optimistic Update
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, valor: numValue } : d))
    )
    setEditingDealId(null)

    negociosService.updateNegocio(deal.id, {
      etapa: deal.etapa,
      valor: numValue
    }).catch((err) => {
      console.error('Failed to update value:', err)
      fetchDeals()
    })
  }

  // Drawer detail handlers
  const handleOpenDetails = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDrawerOpen(true)
    setDetailsLoading(true)
    setDetailsError(null)
    setSelectedLead(null)

    leadsService.getLeadByPhone(phone)
      .then((data) => {
        setSelectedLead(data)
        setDetailsLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching lead details:', err)
        setDetailsError('Erro ao carregar detalhes do lead. Tente novamente.')
        setDetailsLoading(false)
      })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setSelectedLead(null)
  }

  const getWhatsAppLink = (phone?: string) => {
    if (!phone) return '#'
    const cleanPhone = phone.replace(/\D/g, '')
    const whatsappUrl = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone
    return `https://wa.me/${whatsappUrl}`
  }

  // Calculate Funnel KPI Totals
  const kpis = useMemo(() => {
    const totalCount = deals.length
    const totalValue = deals.reduce((sum, d) => sum + (d.valor || 0), 0)
    
    // Won deals (etapa === 'Ganho')
    const wonDeals = deals.filter((d) => d.etapa === 'Ganho')
    const wonCount = wonDeals.length
    const conversionRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0
    
    // Scheduled meetings count
    const meetingsCount = deals.filter((d) => d.status_chamada === 'Agendou Reunião').length

    return {
      totalCount,
      totalValue,
      conversionRate,
      meetingsCount
    }
  }, [deals])

  // Group deals by column stage
  const dealsByColumn = useMemo(() => {
    const groups: Record<string, Negocio[]> = {}
    COLUMNS.forEach((c) => {
      groups[c.id] = []
    })
    deals.forEach((d) => {
      if (groups[d.etapa]) {
        groups[d.etapa].push(d)
      } else {
        // Fallback to NOVO if stage is unrecognized
        groups['Novo'].push(d)
      }
    })
    return groups
  }, [deals])

  return (
    <div className="space-y-6">
      {/* Top Title Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Funil de Negócios</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe o funil de vendas. Arraste e solte os cartões para mudar a etapa do negócio.
          </p>
        </div>
        <button
          onClick={fetchDeals}
          className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] bg-[var(--card-bg)] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>Atualizar Funil</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Value */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Valor do Pipeline</span>
            <h3 className="text-2xl font-bold text-[var(--text)]">{formatCurrency(kpis.totalValue)}</h3>
            <p className="text-[11px] text-slate-500">Soma estimada de negócios</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 2: Counts */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Negócios Ativos</span>
            <h3 className="text-2xl font-bold text-[var(--text)]">{kpis.totalCount}</h3>
            <p className="text-[11px] text-slate-500">Contatos mapeados no funil</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 3: Conversion Rate */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Taxa de Conversão</span>
            <h3 className="text-2xl font-bold text-[var(--text)]">{kpis.conversionRate}%</h3>
            <div className="w-28 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full"
                style={{ width: `${kpis.conversionRate}%` }}
              ></div>
            </div>
          </div>
          <div className="h-12 w-12 rounded-lg bg-pink-50 dark:bg-pink-950/30 flex items-center justify-center text-pink-600 dark:text-pink-400">
            <Award className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar negócio por nome, telefone, e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-[var(--border)] dark:bg-slate-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Campaign select */}
        <div className="relative w-full md:w-64">
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="w-full pl-3 pr-8 py-2 border border-[var(--border)] dark:bg-slate-900 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="all">Todas as Campanhas</option>
            {campaigns.map((c) => (
              <option key={c.campaign_id || c.campaign_name} value={c.campaign_id || c.campaign_name}>
                {c.campaign_name}
              </option>
            ))}
          </select>
          <Filter className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
          <span className="text-sm font-medium text-slate-500">Carregando funil de vendas...</span>
        </div>
      ) : error ? (
        <div className="text-center py-20 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm">
          <p className="text-red-500 font-semibold">{error}</p>
          <button
            onClick={fetchDeals}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
          >
            Tentar Novamente
          </button>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 select-none min-h-[600px] items-start">
          {COLUMNS.map((column) => {
            const columnDeals = (dealsByColumn[column.id] || []) as Negocio[]
            const columnTotalValue = columnDeals.reduce((sum: number, d: Negocio) => sum + (d.valor || 0), 0)

            return (
              <div
                key={column.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
                className="w-80 shrink-0 flex flex-col bg-slate-100/70 dark:bg-slate-900/40 border border-[var(--border)] rounded-xl max-h-[700px] overflow-hidden"
              >
                {/* Column Header */}
                <div className={`p-4 border-t-4 ${column.color} border-b border-[var(--border)] bg-slate-50/80 dark:bg-slate-900/60 flex flex-col gap-1.5`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider">{column.name}</span>
                    <span className="text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                      {columnDeals.length}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    Soma: {formatCurrency(columnTotalValue)}
                  </div>
                </div>

                {/* Column Card Body */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[450px]">
                  {columnDeals.length === 0 ? (
                    <div className="h-full flex items-center justify-center py-20 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      <span className="text-xs text-slate-400">Arraste um lead para cá</span>
                    </div>
                  ) : (
                    columnDeals.map((deal: Negocio) => {
                      const isEditingValue = editingDealId === deal.id
                      const initials = deal.full_name
                        ? deal.full_name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
                        : 'U'

                      return (
                        <div
                          key={deal.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, deal.id)}
                          className="bg-[var(--card-bg)] border border-[var(--border)] hover:border-slate-350 dark:hover:border-slate-700 rounded-lg p-3.5 shadow-sm space-y-3 cursor-grab active:cursor-grabbing hover:shadow-md transition duration-150 relative group"
                        >
                          {/* Top: Name & Quick view */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center shrink-0">
                                {initials}
                              </div>
                              <h4
                                onClick={(e) => handleOpenDetails(deal.phone, e)}
                                className="text-xs font-bold text-[var(--text)] line-clamp-1 hover:text-indigo-600 cursor-pointer transition-colors"
                              >
                                {deal.full_name || 'Sem Nome'}
                              </h4>
                            </div>

                            <button
                              onClick={(e) => handleOpenDetails(deal.phone, e)}
                              className="p-1 text-slate-450 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors shrink-0"
                              title="Visualizar Detalhes"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Campaign Label */}
                          <div className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium px-2 py-0.5 rounded border border-slate-250/20 dark:border-slate-700/50 block w-fit truncate max-w-full">
                            {deal.campaign_name || 'Campanha Direta'}
                          </div>

                          {/* Call classification tag */}
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wide ${getStatusBadgeStyle(deal.status_chamada)}`}>
                              {deal.status_chamada}
                            </span>
                            <span className="text-[10px] text-slate-400">{deal.platform || 'Meta'}</span>
                          </div>

                          {/* Editable Value Box */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            {isEditingValue ? (
                              <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-slate-400 font-bold">R$</span>
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  className="w-20 px-1 py-0.5 text-xs border border-indigo-500 rounded bg-slate-50 dark:bg-slate-900 focus:outline-none text-[var(--text)] font-semibold"
                                  autoFocus
                                  placeholder="0"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveValue(deal)
                                    if (e.key === 'Escape') setEditingDealId(null)
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveValue(deal)}
                                  className="p-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setEditingDealId(null)}
                                  className="p-0.5 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={(e) => handleStartEditValue(deal, e)}
                                className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-1.5 py-0.5 rounded transition duration-150"
                                title="Clique para editar o valor"
                              >
                                <span>{deal.valor > 0 ? formatCurrency(deal.valor) : 'Definir Valor'}</span>
                                <Edit2 className="h-2.5 w-2.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            )}

                            {/* Stage Shifter Arrows for Mobile/No-drag accessibility */}
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveDealStage(deal, 'left')
                                }}
                                className="p-0.5 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-slate-400"
                                disabled={column.id === COLUMNS[0].id}
                                title="Mover para Etapa Anterior"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveDealStage(deal, 'right')
                                }}
                                className="p-0.5 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900 text-slate-400 hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-slate-400"
                                disabled={column.id === COLUMNS[COLUMNS.length - 1].id}
                                title="Mover para Próxima Etapa"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Slide drawer for calling audit logs (cloned from LeadsPage) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={closeDrawer}
          />

          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-xl sm:max-w-2xl bg-[var(--card-bg)] border-l border-[var(--border)] shadow-2xl flex flex-col h-full overflow-hidden text-[var(--text)]">
              {/* Header */}
              <div className="p-6 border-b border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/10 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Histórico do Lead</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Detalhes do lead e linha do tempo de ligações com gravações e resumos de IA.
                  </p>
                </div>
                <button
                  onClick={closeDrawer}
                  className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {detailsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4 h-full">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                    <span className="text-sm font-medium text-slate-500">Buscando histórico do lead...</span>
                  </div>
                ) : detailsError ? (
                  <div className="text-center py-10">
                    <p className="text-red-500 text-sm font-semibold">{detailsError}</p>
                    <button
                      onClick={(e) => handleOpenDetails(selectedLead?.phone || '', e)}
                      className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                    >
                      Recarregar
                    </button>
                  </div>
                ) : selectedLead ? (
                  <>
                    <div className="bg-slate-50/60 dark:bg-slate-800/10 border border-[var(--border)] rounded-xl p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold flex items-center justify-center text-base shrink-0">
                          {selectedLead.full_name
                            ? selectedLead.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
                            : 'L'}
                        </div>
                        <div>
                          <h3 className="text-base font-bold">{selectedLead.full_name || 'Sem Nome'}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeStyle(selectedLead.status_chamada)} mt-1`}>
                            {selectedLead.status_chamada}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs border-t border-[var(--border)] text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                          <span>{selectedLead.phone || 'Sem telefone'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          <span className="truncate">{selectedLead.email || 'Sem e-mail'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          <span>{selectedLead.city || 'Cidade desconhecida'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>Cadastrado em: {formatDateOnly(selectedLead.created_time)}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">Campanha: {selectedLead.campaign_name} ({selectedLead.platform})</span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <a
                          href={getWhatsAppLink(selectedLead.phone)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors"
                        >
                          <MessageSquare className="h-4 w-4" />
                          <span>Abrir WhatsApp ({selectedLead.phone})</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Volume2 className="h-4 w-4 text-indigo-500" />
                        <span>Histórico de Chamadas ({selectedLead.chamadas?.length || 0})</span>
                      </h4>

                      {!selectedLead.chamadas || selectedLead.chamadas.length === 0 ? (
                        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-xl bg-slate-50/30 dark:bg-slate-900/10">
                          <Phone className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-xs text-slate-500">Este lead ainda não recebeu nenhuma ligação de contato.</p>
                        </div>
                      ) : (
                        <div className="relative pl-6 border-l border-slate-200 dark:border-slate-800 space-y-6 ml-3">
                          {selectedLead.chamadas.map((call, idx) => {
                            const { classif, subcat, score } = classifyCall(call)
                            return (
                              <div key={call.id || idx} className="relative">
                                <div className="absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 bg-indigo-600 dark:bg-indigo-400 flex items-center justify-center shadow-sm">
                                  <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
                                </div>

                                <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-2">
                                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                      {formatDate(call.data_hora)}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${getStatusBadgeStyle(classif)}`}>
                                        {classif}
                                      </span>
                                      {subcat && subcat !== classif && (
                                        <span className="text-[10px] text-slate-450 dark:text-slate-500 font-medium">({subcat})</span>
                                      )}
                                      {score && (
                                        <div className="flex items-center gap-0.5 text-amber-500 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-200/50">
                                          <Star className="h-3 w-3 fill-amber-500" />
                                          <span>{score}/8</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                                    <div>
                                      Duração: <span className="font-semibold text-slate-600 dark:text-slate-300">{formatDuration(call.duracao_segundos)}</span>
                                    </div>
                                    <div className="text-right">
                                      Origem: <span className="font-semibold text-slate-600 dark:text-slate-300">{call.source_file ? call.source_file.replace('.csv', '') : 'Manual'}</span>
                                    </div>
                                  </div>

                                  {call.resumo_ligacao && (
                                    <div className="bg-indigo-50/20 dark:bg-indigo-950/10 border-l-2 border-indigo-400/80 p-3 rounded-r-lg space-y-1">
                                      <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                                        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                                        <span>Resumo de IA</span>
                                      </div>
                                      <p className="text-xs italic text-slate-600 dark:text-slate-300 leading-relaxed">
                                        "{call.resumo_ligacao}"
                                      </p>
                                    </div>
                                  )}

                                  {call.tag && (
                                    <div className="flex flex-wrap gap-1">
                                      {call.tag.split(',').map((t, tIdx) => (
                                        <span
                                          key={tIdx}
                                          className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded"
                                        >
                                          {t.trim()}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {call.anotacoes && (
                                    <div className="text-xs bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded border border-slate-200/50 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                                      <span className="font-semibold block mb-0.5">Anotações:</span>
                                      {call.anotacoes}
                                    </div>
                                  )}

                                  {call.link_gravacao && (
                                    <div className="pt-2">
                                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                                        Gravação do Contato
                                      </label>
                                      <audio
                                        controls
                                        src={call.link_gravacao}
                                        className="w-full h-8 outline-none rounded bg-slate-50 dark:bg-slate-900 border border-[var(--border)]"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
