import { useState, useEffect } from 'react'
import { leadsService } from '../services/leads'
import { campanhasService } from '../services/campanhas'
import type { CampanhasResponse } from '../services/campanhas'
import type { Lead, LeadWithCalls, Call } from '../types/lead'
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Volume2,
  Star,
  X,
  PhoneCall,
  Smartphone,
  ExternalLink,
  Target,
  FileText,
  Activity,
  Award,
  Clock,
  MessageSquare
} from 'lucide-react'

// Helper to format date strings
const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '-'
  try {
    // Replace space with T to handle simple date time strings in JS Date parser
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

// Helper to format duration in seconds to M minutes and S seconds
const formatDuration = (seconds?: number | null) => {
  if (seconds === undefined || seconds === null) return '-'
  if (seconds === 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Helper to get color classes for call classification
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
      return 'bg-slate-50 text-slate-700 dark:bg-slate-800/20 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
  }
}

// Local helper to classify a call on the client side
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

export default function LeadsPage() {
  // Leads List state
  const [leads, setLeads] = useState<Lead[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [campaigns, setCampaigns] = useState<CampanhasResponse[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // KPIs
  const [kpis, setKpis] = useState({
    total_leads: 0,
    total_com_chamada: 0,
    total_agendados: 0,
    taxa_contato: 0,
    conv_sem_contato: 0
  })
  const [kpisLoading, setKpisLoading] = useState(true)

  // Details drawer
  const [selectedLead, setSelectedLead] = useState<LeadWithCalls | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Search input debounce handler
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1) // Reset to first page on search
    }, 450)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Fetch KPIs and Campaign list once on mount
  useEffect(() => {
    setKpisLoading(true)
    leadsService.getKpis()
      .then((data) => {
        setKpis(data)
        setKpisLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching KPIs:', err)
        setKpisLoading(false)
      })

    campanhasService.getCampanhas()
      .then((data) => {
        setCampaigns(data || [])
      })
      .catch((err) => {
        console.error('Error fetching campaigns:', err)
      })
  }, [])

  // Fetch leads when page, size, or filters change
  const fetchLeads = () => {
    setLoading(true)
    leadsService.getLeads({
      page,
      page_size: pageSize,
      campanha_id: selectedCampaign !== 'all' ? selectedCampaign : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      search: debouncedSearch ? debouncedSearch : undefined
    })
      .then((data) => {
        setLeads(data.items || [])
        setTotalLeads(data.total || 0)
        setTotalPages(data.pages || 0)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching leads list:', err)
        setError('Erro ao buscar leads. Verifique a conexão com a API.')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchLeads()
  }, [page, pageSize, selectedCampaign, selectedStatus, debouncedSearch])

  // Open Lead details panel
  const handleOpenDetails = (phone: string) => {
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

  // Get WhatsApp redirect url
  const getWhatsAppLink = (phone?: string) => {
    if (!phone) return '#'
    const cleanPhone = phone.replace(/\D/g, '')
    const whatsappUrl = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone
    return `https://wa.me/${whatsappUrl}`
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Gestão de Leads</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Lista completa de leads integrados, com filtros de campanhas e histórico de interações.
          </p>
        </div>
        <button
          onClick={fetchLeads}
          className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] bg-[var(--card-bg)] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span>Atualizar Lista</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total de Leads</span>
            {kpisLoading ? (
              <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <h3 className="text-2xl font-bold text-[var(--text)]">{kpis.total_leads}</h3>
            )}
            <p className="text-[11px] text-slate-500">Leads capturados no banco</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Target className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Leads com Contato</span>
            {kpisLoading ? (
              <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <h3 className="text-2xl font-bold text-[var(--text)]">{kpis.total_com_chamada}</h3>
            )}
            <p className="text-[11px] text-slate-500">Leads que receberam ligações</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <PhoneCall className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Reuniões Agendadas</span>
            {kpisLoading ? (
              <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <h3 className="text-2xl font-bold text-[var(--text)]">{kpis.total_agendados}</h3>
            )}
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Conversões de agendamento</p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Award className="h-6 w-6" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Taxa de Contato</span>
            {kpisLoading ? (
              <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded"></div>
            ) : (
              <h3 className="text-2xl font-bold text-[var(--text)]">{kpis.taxa_contato}%</h3>
            )}
            <div className="w-28 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full"
                style={{ width: `${Math.min(kpis.taxa_contato, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="h-12 w-12 rounded-lg bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Activity className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Search bar */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium text-slate-500">Buscar Lead</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, e-mail, telefone, cidade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-[var(--border)] dark:bg-slate-900 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-shadow"
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
          </div>

          {/* Campaign Filter */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500">Campanha</label>
            <div className="relative">
              <select
                value={selectedCampaign}
                onChange={(e) => {
                  setSelectedCampaign(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 border border-[var(--border)] dark:bg-slate-900 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-shadow"
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

          {/* Status Filter */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500">Status de Contato</label>
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 border border-[var(--border)] dark:bg-slate-900 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-shadow"
              >
                <option value="all">Todos os Status</option>
                <option value="Agendou Reunião">Agendou Reunião</option>
                <option value="Lead Qualificado">Lead Qualificado</option>
                <option value="Sem Contato Efetivo">Sem Contato Efetivo</option>
                <option value="Caixa Postal / Não Atendido">Caixa Postal / Não Atendido</option>
                <option value="Sem Interesse">Sem Interesse</option>
                <option value="Lead Desqualificado">Lead Desqualificado</option>
                <option value="Sem Ligação">Sem Ligação</option>
              </select>
              <Filter className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Leads Table Container */}
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
            <span className="text-sm font-medium text-slate-500">Carregando leads...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 px-4">
            <p className="text-red-500 font-medium">{error}</p>
            <button
              onClick={fetchLeads}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
            >
              Tentar Novamente
            </button>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <User className="h-6 w-6" />
            </div>
            <h4 className="text-base font-semibold text-[var(--text)]">Nenhum lead encontrado</h4>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Nenhum registro corresponde aos filtros ou pesquisa selecionada. Tente limpar os filtros.
            </p>
            {(selectedStatus !== 'all' || selectedCampaign !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedStatus('all')
                  setSelectedCampaign('all')
                  setSearchQuery('')
                }}
                className="mt-4 px-4 py-2 border border-[var(--border)] hover:bg-slate-50 text-sm font-medium rounded-lg"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-slate-50/50 dark:bg-slate-800/20 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-4 px-6">Lead</th>
                  <th className="py-4 px-6">Telefone</th>
                  <th className="py-4 px-6">Origem / Cidade</th>
                  <th className="py-4 px-6">Campanha / Canal</th>
                  <th className="py-4 px-6 text-center">Status de Contato</th>
                  <th className="py-4 px-6">Última Chamada</th>
                  <th className="py-4 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-sm text-[var(--text)]">
                {leads.map((lead) => {
                  const initials = lead.full_name
                    ? lead.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
                    : 'U'
                  const isInstagram = lead.platform === 'Instagram' || lead.platform === 'ig'
                  const isOrganic = lead.is_organic === 1

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/10 transition-colors group cursor-pointer"
                      onClick={() => handleOpenDetails(lead.phone)}
                    >
                      {/* Name & Email */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold flex items-center justify-center text-xs shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold truncate max-w-[180px] group-hover:text-indigo-600 transition-colors">
                              {lead.full_name || 'Sem Nome'}
                            </h4>
                            <p className="text-xs text-slate-400 truncate max-w-[180px]">
                              {lead.email || 'Sem e-mail'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-4 px-6 font-medium whitespace-nowrap">
                        <span className="text-slate-600 dark:text-slate-300">{lead.phone || '-'}</span>
                      </td>

                      {/* Region / City */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[120px]">{lead.city || 'Desconhecida'}</span>
                        </div>
                      </td>

                      {/* Campaign & Platform */}
                      <td className="py-4 px-6">
                        <div className="space-y-1">
                          <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/50 block w-fit max-w-[160px] truncate">
                            {lead.campaign_name || 'Campanha Direta'}
                          </span>
                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <span className={`h-1.5 w-1.5 rounded-full ${isInstagram ? 'bg-pink-500' : 'bg-blue-500'}`}></span>
                            <span>{lead.platform || 'Facebook'}</span>
                            {isOrganic && <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-bold">(Orgânico)</span>}
                          </div>
                        </div>
                      </td>

                      {/* Contact Status */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeStyle(lead.status_chamada)}`}>
                          {lead.status_chamada}
                        </span>
                      </td>

                      {/* Last Call */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        {lead.call_date ? (
                          <div className="space-y-0.5">
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              <span>{formatDate(lead.call_date)}</span>
                            </div>
                            {lead.call_duration !== null && (
                              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Duração: {formatDuration(lead.call_duration)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-normal">Nenhum registro</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-4 px-6 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenDetails(lead.phone)}
                          className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors inline-flex items-center gap-1.5 text-xs font-semibold"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>Ver Chamadas</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {!loading && leads.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-[var(--border)] px-6 py-4 gap-4 bg-slate-50/50 dark:bg-slate-800/10">
            <div className="text-xs text-slate-500">
              Exibindo <span className="font-semibold text-[var(--text)]">{Math.min((page - 1) * pageSize + 1, totalLeads)}</span> a{' '}
              <span className="font-semibold text-[var(--text)]">{Math.min(page * pageSize, totalLeads)}</span> de{' '}
              <span className="font-semibold text-[var(--text)]">{totalLeads}</span> leads.
            </div>

            <div className="flex items-center gap-4">
              {/* Page size selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Exibir:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="px-2 py-1 border border-[var(--border)] dark:bg-slate-900 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Prev / Next buttons */}
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  className="p-1.5 border border-[var(--border)] rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="text-xs font-semibold text-[var(--text)] px-3">
                  Página {page} de {totalPages || 1}
                </div>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  className="p-1.5 border border-[var(--border)] rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side drawer for details & call history */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop overlay */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={closeDrawer}
          />

          {/* Drawer container */}
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
                      onClick={() => handleOpenDetails(selectedLead?.phone || '')}
                      className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
                    >
                      Recarregar
                    </button>
                  </div>
                ) : selectedLead ? (
                  <>
                    {/* Lead Profile Info Block */}
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
                          <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">Campanha: {selectedLead.campaign_name} ({selectedLead.platform})</span>
                        </div>
                      </div>

                      {/* WhatsApp Fast Call Action */}
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

                    {/* Calling Timeline */}
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
                                {/* Bullet indicator on the line */}
                                <div className="absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 bg-indigo-600 dark:bg-indigo-400 flex items-center justify-center shadow-sm">
                                  <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
                                </div>

                                {/* Call item box */}
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

                                  {/* Call info grid */}
                                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                                    <div>
                                      Duração: <span className="font-semibold text-slate-600 dark:text-slate-300">{formatDuration(call.duracao_segundos)}</span>
                                    </div>
                                    <div className="text-right">
                                      Origem: <span className="font-semibold text-slate-600 dark:text-slate-300">{call.source_file ? call.source_file.replace('.csv', '') : 'Manual'}</span>
                                    </div>
                                  </div>

                                  {/* Call AI Summary */}
                                  {call.resumo_ligacao && (
                                    <div className="bg-indigo-50/20 dark:bg-indigo-950/10 border-l-2 border-indigo-400/80 p-3 rounded-r-lg space-y-1">
                                      <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                                        <SparklesIcon className="h-3.5 w-3.5 text-indigo-500" />
                                        <span>Resumo de IA</span>
                                      </div>
                                      <p className="text-xs italic text-slate-600 dark:text-slate-300 leading-relaxed">
                                        "{call.resumo_ligacao}"
                                      </p>
                                    </div>
                                  )}

                                  {/* Call tags & notes */}
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

                                  {/* Audio Player */}
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

// Internal inline icon component helper
function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5z" />
      <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
    </svg>
  )
}
