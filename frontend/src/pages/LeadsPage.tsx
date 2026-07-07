import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { leadsService } from '../services/leads'
import { campanhasService } from '../services/campanhas'
import type { CampanhasResponse } from '../services/campanhas'
import { usuariosService } from '../services/usuarios'
import type { Usuario } from '../services/usuarios'
import type { Lead, LeadWithCalls, Call } from '../types/lead'
import WhatsAppTemplateSelector from '../components/WhatsAppTemplateSelector'
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
  Target,
  FileText,
  Activity,
  Award,
  Clock,
  Tag
} from 'lucide-react'

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
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30'
    case 'Lead Qualificado':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-350 dark:border-slate-700'
    case 'Sem Ligação':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30'
    case 'Caixa Postal / Não Atendido':
      return 'bg-slate-100 text-slate-650 dark:bg-slate-800/40 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50'
    case 'Sem Interesse':
      return 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200/50 dark:border-red-900/30'
    case 'Lead Desqualificado':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border border-orange-200/50 dark:border-orange-900/30'
    case 'Retorno Agendado':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400 border border-sky-200/50 dark:border-sky-900/30'
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
  let isRetorno = false
  let isReuniao = false

  if (reuniao && String(reuniao).toLowerCase() !== 'none' && String(reuniao).trim() !== '') {
    if (String(reuniao).toLowerCase().includes('retorno') || String(reuniao).toLowerCase().includes('retorno agendado')) {
      isRetorno = true
    } else {
      isReuniao = true
    }
  }

  if (!isRetorno && !isReuniao) {
    if (resumo.includes('retorno agendado para') || resumo.includes('retorno para') || resumo.includes('agendado retorno')) {
      isRetorno = true
    } else if (resumo.includes('reunião agendada para') || resumo.includes('reuniao agendada para')) {
      isReuniao = true
    }
  }

  if (isRetorno) {
    return { classif: 'Retorno Agendado', subcat: 'Aguardando Retorno do Lead', score: 7 }
  }
  if (isReuniao) {
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
    return { classif: 'Sem Ligação', subcat: 'Pediu para Ligar Depois', score: 4 }
  }
  if (resumo.includes('avaliando internamente') || resumo.includes('avaliar com o sócio')) {
    return { classif: 'Sem Ligação', subcat: 'Avaliando Internamente', score: 5 }
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
    return { classif: 'Sem Ligação', subcat: 'Avaliando Internamente', score: 4 }
  }
  return { classif: 'Caixa Postal / Não Atendido', subcat: 'Caixa Postal / Não Atendido', score: 2 }
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [campaigns, setCampaigns] = useState<CampanhasResponse[]>([])
  const [searchParams] = useSearchParams()
  const campaignParam = searchParams.get('campaign_id')
  const [selectedCampaign, setSelectedCampaign] = useState(campaignParam || 'all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [consultants, setConsultants] = useState<Usuario[]>([])
  const [selectedConsultant, setSelectedConsultant] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [kpis, setKpis] = useState({
    total_leads: 0,
    total_com_chamada: 0,
    total_agendados: 0,
    taxa_contato: 0,
    conv_sem_contato: 0
  })
  const [kpisLoading, setKpisLoading] = useState(true)

  const [selectedLead, setSelectedLead] = useState<LeadWithCalls | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 450)
    return () => clearTimeout(handler)
  }, [searchQuery])

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

    usuariosService.list()
      .then((data) => {
        setConsultants(data.filter(u => u.role === 'consultor') || [])
      })
      .catch((err) => {
        console.error('Error fetching consultants:', err)
      })
  }, [])

  const fetchLeads = () => {
    setLoading(true)
    leadsService.getLeads({
      page,
      page_size: pageSize,
      campanha_id: selectedCampaign !== 'all' ? selectedCampaign : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      consultant: selectedConsultant !== 'all' ? selectedConsultant : undefined,
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
  }, [page, pageSize, selectedCampaign, selectedStatus, selectedConsultant, debouncedSearch])

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


  return (
    <div className="space-y-4 transition-colors duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">Gestão de Leads</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Lista completa de leads integrados, com filtros de campanhas e histórico de interações.
          </p>
        </div>
        <button
          onClick={fetchLeads}
          className="flex items-center gap-1.5 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm h-8 px-3 rounded-md transition-colors duration-150"
        >
          <Activity className="h-4 w-4 stroke-[1.5] text-[var(--text-secondary)]" />
          <span>Atualizar Lista</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Total de Leads</span>
            {kpisLoading ? (
              <div className="h-8 w-20 bg-[var(--surface-raised)] animate-pulse rounded-md"></div>
            ) : (
              <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.total_leads}</h3>
            )}
            <p className="text-xs text-[var(--text-secondary)]">Leads capturados no banco</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <Target className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Leads com Contato</span>
            {kpisLoading ? (
              <div className="h-8 w-20 bg-[var(--surface-raised)] animate-pulse rounded-md"></div>
            ) : (
              <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.total_com_chamada}</h3>
            )}
            <p className="text-xs text-[var(--text-secondary)]">Leads que receberam ligações</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <PhoneCall className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Reuniões Agendadas</span>
            {kpisLoading ? (
              <div className="h-8 w-20 bg-[var(--surface-raised)] animate-pulse rounded-md"></div>
            ) : (
              <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.total_agendados}</h3>
            )}
            <p className="text-xs text-emerald-600 dark:text-emerald-450 font-medium">Conversões de agendamento</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <Award className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Taxa de Ligação</span>
            {kpisLoading ? (
              <div className="h-8 w-20 bg-[var(--surface-raised)] animate-pulse rounded-md"></div>
            ) : (
              <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.taxa_contato}%</h3>
            )}
            <div className="w-24 bg-[var(--border)] h-1 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-[var(--accent)] h-full rounded-full"
                style={{ width: `${Math.min(kpis.taxa_contato, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <Activity className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 transition-colors duration-150">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Search bar */}
          <div className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Buscar Lead</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-[var(--text-tertiary)] stroke-[1.5]" />
              <input
                type="text"
                placeholder="Buscar por nome, e-mail, telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-8 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4 stroke-[1.5]" />
                </button>
              )}
            </div>
          </div>

          {/* Campaign Filter */}
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Campanha</span>
            <div className="relative">
              <select
                value={selectedCampaign}
                onChange={(e) => {
                  setSelectedCampaign(e.target.value)
                  setPage(1)
                }}
                className="w-full h-8 pl-3 pr-8 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] appearance-none transition-colors duration-150"
              >
                <option value="all">Todas as Campanhas</option>
                {campaigns.map((c) => (
                  <option key={c.campaign_id || c.campaign_name} value={c.campaign_id || c.campaign_name}>
                    {c.campaign_name}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-tertiary)] stroke-[1.5] pointer-events-none" />
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Status de Contato</span>
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value)
                  setPage(1)
                }}
                className="w-full h-8 pl-3 pr-8 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] appearance-none transition-colors duration-150"
              >
                <option value="all">Todos os Status</option>
                <option value="Agendou Reunião">Agendou Reunião</option>
                <option value="Lead Qualificado">Lead Qualificado</option>
                <option value="Sem Ligação">Sem Ligação</option>
                <option value="Caixa Postal / Não Atendido">Caixa Postal / Não Atendido</option>
                <option value="Sem Interesse">Sem Interesse</option>
                <option value="Lead Desqualificado">Lead Desqualificado</option>
                <option value="Sem Ligação">Sem Ligação</option>
              </select>
              <Filter className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-tertiary)] stroke-[1.5] pointer-events-none" />
            </div>
          </div>

          {/* Consultant Filter */}
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Consultor</span>
            <div className="relative">
              <select
                value={selectedConsultant}
                onChange={(e) => {
                  setSelectedConsultant(e.target.value)
                  setPage(1)
                }}
                className="w-full h-8 pl-3 pr-8 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] appearance-none transition-colors duration-150"
              >
                <option value="all">Todos os Consultores</option>
                <option value="unassigned">Sem Consultor</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-tertiary)] stroke-[1.5] pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Leads Table Container */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
            <span className="text-xs text-[var(--text-secondary)]">Carregando leads...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 px-4">
            <p className="text-red-500 font-medium text-sm">{error}</p>
            <button
              onClick={fetchLeads}
              className="mt-4 h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium rounded-md transition-colors duration-150"
            >
              Tentar Novamente
            </button>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="h-10 w-10 rounded-full bg-[var(--surface-raised)] flex items-center justify-center mx-auto text-[var(--text-secondary)] mb-3">
              <User className="h-5 w-5 stroke-[1.5]" />
            </div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Nenhum lead encontrado</h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
              Nenhum registro corresponde aos filtros ou pesquisa selecionada. Tente limpar os filtros.
            </p>
            {(selectedStatus !== 'all' || selectedCampaign !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedStatus('all')
                  setSelectedCampaign('all')
                  setSearchQuery('')
                }}
                className="mt-4 bg-transparent border border-[var(--border)] text-[var(--text-primary)] text-sm h-8 px-3 rounded-md hover:bg-[var(--surface-raised)] transition-colors duration-150"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  <th className="py-2.5 px-4 font-semibold">Lead</th>
                  <th className="py-2.5 px-4 font-semibold">Telefone</th>
                  <th className="py-2.5 px-4 font-semibold">Origem / Cidade</th>
                  <th className="py-2.5 px-4 font-semibold">Canal</th>
                  <th className="py-2.5 px-4 font-semibold">Dono</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Status de Contato</th>
                  <th className="py-2.5 px-4 font-semibold">Última Chamada</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm text-[var(--text-primary)]">
                {leads.map((lead) => {
                  const initials = lead.full_name
                      ? lead.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
                      : 'U'
                  const isInstagram = lead.platform === 'Instagram' || lead.platform === 'ig'
                  const isOrganic = lead.is_organic === 1

                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150 cursor-pointer group"
                      onClick={() => handleOpenDetails(lead.phone)}
                    >
                      {/* Name & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border)] font-medium flex items-center justify-center text-xs shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold truncate max-w-[180px] text-[var(--text-primary)]">
                              {lead.full_name || 'Sem Nome'}
                            </h4>
                            <p className="text-xs text-[var(--text-secondary)] truncate max-w-[180px]">
                              {lead.email || 'Sem e-mail'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 whitespace-nowrap text-[var(--text-primary)] font-normal">
                        {lead.phone || '-'}
                      </td>

                      {/* Region / City */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                          <MapPin className="h-3.5 w-3.5 stroke-[1.5] shrink-0" />
                          <span className="truncate max-w-[120px]">{lead.city || 'Desconhecida'}</span>
                        </div>
                      </td>

                      {/* Platform / Canal */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 text-[12px] text-[var(--text-primary)]">
                          <span className={`h-2 w-2 rounded-full ${isInstagram ? 'bg-pink-500' : 'bg-blue-500'}`}></span>
                          <span>{lead.platform || 'Facebook'}</span>
                          {isOrganic && <span className="ml-1 text-emerald-600 dark:text-emerald-450 font-medium text-[11px]">(Orgânico)</span>}
                        </div>
                      </td>

                      {/* Dono */}
                      <td className="py-3 px-4 text-sm font-medium text-[var(--text-primary)]">
                        {lead.usuario_nome || '-'}
                      </td>

                      {/* Contact Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadgeStyle(lead.status_chamada)}`}>
                          {lead.status_chamada}
                        </span>
                      </td>

                      {/* Last Call */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {lead.call_date ? (
                          <div className="space-y-0.5 text-xs text-[var(--text-primary)]">
                            <div className="font-medium flex items-center gap-1">
                              <Calendar className="h-3 w-3 stroke-[1.5] text-[var(--text-secondary)]" />
                              <span>{formatDate(lead.call_date)}</span>
                            </div>
                            {lead.call_duration !== null && (
                              <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                                <Clock className="h-3 w-3 stroke-[1.5]" />
                                <span>Duração: {formatDuration(lead.call_duration)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)] font-normal">Nenhum registro</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenDetails(lead.phone)}
                          className="h-7 px-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] border border-transparent hover:border-[var(--border)] rounded-md transition-colors duration-150 inline-flex items-center gap-1 text-xs font-medium bg-transparent"
                        >
                          <Phone className="h-3.5 w-3.5 stroke-[1.5]" />
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
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-[var(--border)] px-4 py-3 gap-3 bg-[var(--surface)] text-[var(--text-secondary)] transition-colors duration-150">
            <div className="text-xs">
              Exibindo <span className="font-semibold text-[var(--text-primary)]">{Math.min((page - 1) * pageSize + 1, totalLeads)}</span> a{' '}
              <span className="font-semibold text-[var(--text-primary)]">{Math.min(page * pageSize, totalLeads)}</span> de{' '}
              <span className="font-semibold text-[var(--text-primary)]">{totalLeads}</span> leads.
            </div>

            <div className="flex items-center gap-4">
              {/* Page size selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs">Exibir:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="h-7 px-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
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
                  className="p-1 border border-[var(--border)] rounded-md bg-transparent hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent transition-colors duration-150"
                >
                  <ChevronLeft className="h-3.5 w-3.5 stroke-[1.5]" />
                </button>

                <div className="text-xs font-semibold text-[var(--text-primary)] px-2">
                  Página {page} de {totalPages || 1}
                </div>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  className="p-1 border border-[var(--border)] rounded-md bg-transparent hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent transition-colors duration-150"
                >
                  <ChevronRight className="h-3.5 w-3.5 stroke-[1.5]" />
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
            className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={closeDrawer}
          />

          {/* Drawer container */}
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-xl sm:max-w-2xl bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden text-[var(--text-primary)] transition-colors duration-150">
              {/* Header */}
              <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">Histórico do Lead</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Detalhes do lead e linha do tempo de ligações.
                  </p>
                </div>
                <button
                  onClick={closeDrawer}
                  className="p-1 rounded-md border border-[var(--border)] bg-transparent hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                >
                  <X className="h-4 w-4 stroke-[1.5]" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {detailsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4 h-full">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
                    <span className="text-xs text-[var(--text-secondary)]">Buscando histórico do lead...</span>
                  </div>
                ) : detailsError ? (
                  <div className="text-center py-10">
                    <p className="text-red-500 text-xs font-semibold">{detailsError}</p>
                    <button
                      onClick={() => handleOpenDetails(selectedLead?.phone || '')}
                      className="mt-4 h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-medium rounded-md transition-colors duration-150"
                    >
                      Recarregar
                    </button>
                  </div>
                ) : selectedLead ? (
                  <>
                    {/* Lead Profile Info Block */}
                    <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-4 space-y-3 transition-colors duration-150">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] font-bold flex items-center justify-center text-sm shrink-0">
                          {selectedLead.full_name
                            ? selectedLead.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
                            : 'L'}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{selectedLead.full_name || 'Sem Nome'}</h3>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadgeStyle(selectedLead.status_chamada)} mt-1`}>
                            {selectedLead.status_chamada}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-3.5 w-3.5 stroke-[1.5]" />
                          <span>{selectedLead.phone || 'Sem telefone'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 stroke-[1.5]" />
                          <span className="truncate">{selectedLead.email || 'Sem e-mail'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 stroke-[1.5]" />
                          <span>{selectedLead.city || 'Cidade desconhecida'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 stroke-[1.5]" />
                          <span>Cadastrado em: {formatDateOnly(selectedLead.created_time)}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <FileText className="h-3.5 w-3.5 stroke-[1.5] shrink-0" />
                          <span className="truncate">Campanha: {selectedLead.campaign_name} ({selectedLead.platform})</span>
                        </div>
                      </div>

                      {/* WhatsApp Fast Call Action */}
                      <WhatsAppTemplateSelector
                        phone={selectedLead.phone}
                        leadName={selectedLead.full_name}
                        campaignName={selectedLead.campaign_name}
                      />
                    </div>

                    {/* Calling Timeline */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Volume2 className="h-4 w-4 stroke-[1.5]" />
                        <span>Linha do Tempo ({selectedLead.timeline?.length || selectedLead.chamadas?.length || 0})</span>
                      </h4>

                      {!(selectedLead.timeline?.length || selectedLead.chamadas?.length) ? (
                        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-lg bg-[var(--surface-raised)]">
                          <Phone className="h-6 w-6 text-[var(--text-tertiary)] mx-auto mb-2 stroke-[1.5]" />
                          <p className="text-xs text-[var(--text-secondary)] font-normal">Este lead ainda não possui histórico.</p>
                        </div>
                      ) : (
                        <div className="relative pl-4 border-l border-[var(--border)] space-y-4 ml-2">
                          {(selectedLead.timeline || selectedLead.chamadas).map((event: any, idx: number) => {
                            const isLegacyCall = !event.type;
                            const type = event.type || 'call';
                            const itemData = isLegacyCall ? event : event.data;

                            let dateObj;
                            if (type === 'call') dateObj = new Date(itemData.data_hora);
                            else if (type === 'historico') dateObj = new Date(itemData.data_hora);
                            else dateObj = new Date(itemData.created_at);

                            const call = type === 'call' ? itemData : null;
                            let classif, subcat, score;
                            if (call) {
                              const classified = classifyCall(call);
                              classif = classified.classif;
                              subcat = classified.subcat;
                              score = classified.score;
                            }

                            return (
                              <div key={idx} className="relative">
                                {/* Bullet indicator on the line */}
                                <div className={`absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border border-[var(--border)] ${
                                  type === 'call' ? 'bg-[var(--accent)]' :
                                  type === 'historico' ? 'bg-purple-500' : 'bg-emerald-500'
                                }`}></div>

                                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 shadow-sm hover:border-[var(--border-hover)] transition-colors duration-150">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                                        {formatDate(dateObj.toISOString())}
                                      </span>
                                      
                                      {type === 'call' && classif && (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase border ${
                                          classif === 'Lead Qualificado' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                          classif === 'Caixa Postal / Não Atendido' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                                          classif === 'Agendou Reunião' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                                          classif === 'Sem Interesse' || classif === 'Lead Desqualificado' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                                          'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                        }`}>
                                          {classif}
                                        </span>
                                      )}

                                      {type === 'historico' && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-purple-500/10 text-purple-600 border border-purple-500/20">
                                          Mudança de Etapa
                                        </span>
                                      )}

                                      {type === 'comment' && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                          Comentário
                                        </span>
                                      )}
                                    </div>
                                    {type === 'call' && call.duracao_segundos > 0 && (
                                      <span className="text-[10px] font-medium text-[var(--text-tertiary)] flex items-center gap-1 shrink-0">
                                        <Clock className="h-3 w-3" />
                                        {formatDuration(call.duracao_segundos)}
                                      </span>
                                    )}
                                  </div>

                                  {type === 'call' && call.resumo_ligacao && (
                                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                                      {call.resumo_ligacao}
                                    </div>
                                  )}

                                  {type === 'historico' && (
                                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                                      <span className="font-medium text-[var(--text-primary)]">{itemData.usuario_nome}</span> moveu de <b>{itemData.etapa_anterior}</b> para <b>{itemData.etapa_nova}</b>.
                                    </div>
                                  )}

                                  {type === 'comment' && (
                                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1 whitespace-pre-wrap">
                                      <b>{itemData.usuario_email?.split('@')[0]}:</b> {itemData.comentario}
                                    </div>
                                  )}

                                  {type === 'call' && (
                                    <>
                                      {(subcat || score) && (
                                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[var(--border)]">
                                          {subcat && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-raised)] px-1.5 py-0.5 rounded">
                                              <Tag className="h-2.5 w-2.5" />
                                              {subcat}
                                            </span>
                                          )}
                                          {score && (
                                            <div className="flex items-center gap-0.5 text-amber-500 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-200/50">
                                              <Star className="h-3 w-3 fill-amber-500 stroke-[1.5]" />
                                              <span>{score}/8</span>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Call info grid */}
                                      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)] mt-2">
                                        <div>
                                          Duração: <span className="font-semibold text-[var(--text-primary)]">{formatDuration(call.duracao_segundos)}</span>
                                        </div>
                                        <div className="text-right">
                                          Origem: <span className="font-semibold text-[var(--text-primary)]">{call.source_file ? call.source_file.replace('.csv', '') : 'Manual'}</span>
                                        </div>
                                      </div>

                                      {/* Call AI Summary */}
                                      {call.resumo_ligacao && (
                                        <div className="bg-[var(--surface-raised)] border-l-2 border-[var(--accent)] p-2.5 rounded-r-md space-y-1 mt-2">
                                          <div className="text-[10px] font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1">
                                            <SparklesIcon className="h-3.5 w-3.5 text-[var(--text-secondary)] stroke-[1.5]" />
                                            <span>Resumo de IA</span>
                                          </div>
                                          <p className="text-xs italic text-[var(--text-primary)] leading-relaxed">
                                            "{call.resumo_ligacao}"
                                          </p>
                                        </div>
                                      )}

                                      {call.tag && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {call.tag.split(',').map((t: string, tIdx: number) => (
                                            <span
                                              key={tIdx}
                                              className="text-[10px] bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded"
                                            >
                                              {t.trim()}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {call.anotacoes && (
                                        <div className="text-xs bg-[var(--surface-raised)] p-2 rounded border border-[var(--border)] text-[var(--text-primary)] mt-2">
                                          <span className="font-semibold block mb-0.5">Anotações:</span>
                                          {call.anotacoes}
                                        </div>
                                      )}

                                      {/* Audio Player */}
                                      {call.link_gravacao && (
                                        <div className="pt-1 mt-2">
                                          <label className="text-[10px] font-semibold text-[var(--text-secondary)] block mb-1">
                                            Gravação do Contato
                                          </label>
                                          <audio
                                            controls
                                            src={call.link_gravacao}
                                            className="w-full h-8 outline-none rounded bg-[var(--surface-raised)] border border-[var(--border)]"
                                          />
                                        </div>
                                      )}
                                    </>
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
