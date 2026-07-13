import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DragEvent, MouseEvent } from 'react'
import { negociosService } from '../services/negocios'
import type { Negocio } from '../services/negocios'
import { campanhasService } from '../services/campanhas'
import type { CampanhasResponse } from '../services/campanhas'
import type { LeadWithCalls, Call } from '../types/lead'
import api from '../services/api'
import WhatsAppTemplateSelector from '../components/WhatsAppTemplateSelector'
import { leadsService } from '../services/leads'
import { agendaService } from '../services/agenda'
import {
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Award,
  Eye,
  Check,
  Edit2,
  X,
  Smartphone,
  Mail,
  MapPin,
  Calendar,
  Phone,
  Volume2,
  Star,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const COLUMNS = [
  { id: 'Sem Contato', name: 'Sem Contato' },
  { id: 'Contatado', name: 'Contatado' },
  { id: 'Qualificado', name: 'Qualificado' },
  { id: 'Reunião Agendada', name: 'Reunião Agendada' },
  { id: 'KYC/COF/Contrato', name: 'KYC/COF/Contrato' },
  { id: 'Ganho', name: 'Ganho' },
  { id: 'Perdido', name: 'Perdido' }
]

// Helpers (Format date, currency, durations)
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

const formatDuration = (seconds?: number | null) => {
  if (seconds === undefined || seconds === null) return '-'
  if (seconds === 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

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

const getClassificationTooltipText = (status: string) => {
  switch (status) {
    case 'Agendou Reunião':
      return 'O lead confirmou o agendamento de uma reunião com o consultor comercial.'
    case 'Lead Qualificado':
      return 'O lead demonstrou perfil de compra e interesse real no modelo de negócio.'
    case 'Sem Ligação':
      return 'Lead ainda não recebeu chamadas da inteligência artificial.'
    case 'Caixa Postal / Não Atendido':
      return 'A discagem foi direcionada para caixa postal ou não foi atendida pelo lead.'
    case 'Sem Interesse':
      return 'O lead expressou recusa direta ou declarou não ter interesse no momento.'
    case 'Lead Desqualificado':
      return 'O contato está fora do perfil ideal de cliente (falta de capital, etc.).'
    case 'Retorno Agendado':
      return 'O lead pediu para retornar a ligação em um dia e horário específico.'
    default:
      return 'Status de chamada não especificado.'
  }
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center ml-1 shrink-0">
      <Info className="w-3 h-3 text-[var(--text-tertiary)] stroke-[1.5] cursor-help hover:text-[var(--text-secondary)] transition-colors" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md shadow-lg p-2 text-[10px] text-[var(--text-secondary)] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50 whitespace-normal text-left font-normal normal-case">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--border)]"></div>
      </div>
    </div>
  )
}


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

export default function NegociosPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [deals, setDeals] = useState<Negocio[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [campaigns, setCampaigns] = useState<CampanhasResponse[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState('all')
  const [selectedConsultant, setSelectedConsultant] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [editingDealId, setEditingDealId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagValue, setEditingTagValue] = useState('')

  const [selectedLead, setSelectedLead] = useState<LeadWithCalls | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Drawer Tag states
  const [drawerTag, setDrawerTag] = useState('')
  const [drawerTagDate, setDrawerTagDate] = useState('')
  const [drawerTagTime, setDrawerTagTime] = useState('')
  const [drawerComment, setDrawerComment] = useState('')
  const [isSubmittingTag, setIsSubmittingTag] = useState(false)

  // Loss Modal states
  const [lossModalOpen, setLossModalOpen] = useState(false)
  const [lossDeal, setLossDeal] = useState<Negocio | null>(null)
  const [lossReason, setLossReason] = useState('')
  const [lossComment, setLossComment] = useState('')
  const [lossCallback, setLossCallback] = useState<((reason: string, comment: string) => void) | null>(null)

  const promptLossReason = (deal: Negocio, onConfirm: (reason: string, comment: string) => void) => {
    setLossDeal(deal)
    setLossReason('')
    setLossComment('')
    setLossCallback(() => (reason: string, comment: string) => {
      onConfirm(reason, comment)
      closeLossModal()
    })
    setLossModalOpen(true)
  }

  const closeLossModal = () => {
    setLossModalOpen(false)
    setLossDeal(null)
    setLossCallback(null)
  }

  const fetchDeals = () => {
    setLoading(true)
    negociosService.getNegocios()
      .then((data) => {
        setDeals(data || [])
        setError(null)
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

    campanhasService.getCampanhas()
      .then((data) => {
        setCampaigns(data || [])
      })
      .catch((err) => {
        console.error('Error fetching campaigns:', err)
      })

    api.get('/settings/custom-tags')
      .then((res) => {
        if (res.data && res.data.tags) {
          setAvailableTags(res.data.tags)
        }
      })
      .catch(err => console.error("Error fetching tags", err))
  }, [])

  const consultantsList = useMemo(() => {
    const set = new Set<string>()
    deals.forEach((d) => {
      if (d.usuario_nome) {
        set.add(d.usuario_nome)
      }
    })
    return Array.from(set).sort()
  }, [deals])

  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      const matchesCampaign =
        selectedCampaign === 'all' ||
        deal.campaign_name === selectedCampaign

      const matchesConsultant =
        selectedConsultant === 'all' ||
        (selectedConsultant === 'unassigned' && !deal.usuario_nome) ||
        deal.usuario_nome === selectedConsultant

      const query = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !query ||
        (deal.full_name || '').toLowerCase().includes(query) ||
        (deal.phone || '').toLowerCase().includes(query) ||
        (deal.email || '').toLowerCase().includes(query)

      return matchesCampaign && matchesConsultant && matchesSearch
    })
  }, [deals, selectedCampaign, selectedConsultant, searchQuery])

  const kpis = useMemo(() => {
    const activeDeals = filteredDeals.filter((d) => d.etapa !== 'lost')
    const totalValue = activeDeals.reduce((sum, d) => sum + (d.valor || 0), 0)
    const totalCount = activeDeals.length

    const wonCount = filteredDeals.filter((d) => d.etapa === 'qualified').length
    const lostCount = filteredDeals.filter((d) => d.etapa === 'lost').length
    const totalClosed = wonCount + lostCount
    const conversionRate = totalClosed > 0 ? Math.round((wonCount / totalClosed) * 100) : 0

    return { totalValue, totalCount, conversionRate }
  }, [filteredDeals])

  const handleDragStart = (e: DragEvent<HTMLDivElement>, dealId: string) => {
    e.dataTransfer.setData('text/plain', dealId)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetStage: string) => {
    e.preventDefault()
    const dealId = e.dataTransfer.getData('text/plain')
    if (!dealId) return

    const dealToMove = deals.find((d) => d.id === dealId)
    if (!dealToMove || dealToMove.etapa === targetStage) return

    if (targetStage === 'Perdido') {
      promptLossReason(dealToMove, async (reason, comment) => {
        const previousDeals = [...deals]
        setDeals((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, etapa: targetStage } : d))
        )
        try {
          await negociosService.updateNegocio(dealId, {
            etapa: targetStage,
            valor: dealToMove.valor,
            loss_reason: reason,
            loss_comment: comment
          })
        } catch (err) {
          console.error('Failed to update stage on server:', err)
          setDeals(previousDeals)
        }
      })
      return
    }

    // Optimistic update
    const previousDeals = [...deals]
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, etapa: targetStage } : d))
    )

    try {
      await negociosService.updateNegocio(dealId, { etapa: targetStage, valor: dealToMove.valor })
    } catch (err) {
      console.error('Failed to update stage on server:', err)
      setDeals(previousDeals)
    }
  }

  const moveDealStage = async (deal: Negocio, direction: 'left' | 'right') => {
    const currentIdx = COLUMNS.findIndex((col) => col.id === deal.etapa)
    if (currentIdx === -1) return

    let nextIdx = currentIdx
    if (direction === 'left') {
      nextIdx = Math.max(0, currentIdx - 1)
    } else {
      nextIdx = Math.min(COLUMNS.length - 1, currentIdx + 1)
    }

    if (currentIdx === nextIdx) return
    const targetStage = COLUMNS[nextIdx].id

    if (targetStage === 'Perdido') {
      promptLossReason(deal, async (reason, comment) => {
        const previousDeals = [...deals]
        setDeals((prev) =>
          prev.map((d) => (d.id === deal.id ? { ...d, etapa: targetStage } : d))
        )
        try {
          await negociosService.updateNegocio(deal.id, {
            etapa: targetStage,
            valor: deal.valor,
            loss_reason: reason,
            loss_comment: comment
          })
        } catch (err) {
          console.error('Failed to update stage:', err)
          setDeals(previousDeals)
        }
      })
      return
    }

    const previousDeals = [...deals]
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, etapa: targetStage } : d))
    )

    try {
      await negociosService.updateNegocio(deal.id, { etapa: targetStage, valor: deal.valor })
    } catch (err) {
      console.error('Failed to update stage:', err)
      setDeals(previousDeals)
    }
  }

  const handleStartEditTag = (deal: Negocio, e: MouseEvent) => {
    e.stopPropagation()
    setEditingTagId(deal.id)
    setEditingTagValue(deal.tags || '')
  }

  const handleSaveTag = async (deal: Negocio) => {
    const val = editingTagValue.trim()
    if (val === (deal.tags || '')) {
      setEditingTagId(null)
      return
    }

    const previousDeals = [...deals]
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, tags: val } : d))
    )
    setEditingTagId(null)

    try {
      await negociosService.updateNegocio(deal.id, { etapa: deal.etapa, valor: deal.valor, tags: val })
    } catch (err) {
      console.error('Failed to save deal tags:', err)
      setDeals(previousDeals)
    }
  }

  const handleStartEditValue = (deal: Negocio, e: MouseEvent) => {
    e.stopPropagation()
    setEditingDealId(deal.id)
    setEditingValue(deal.valor > 0 ? String(deal.valor) : '')
  }

  const handleSaveValue = async (deal: Negocio) => {
    const numValue = parseFloat(editingValue.replace(/[^\d.]/g, '')) || 0
    if (numValue === deal.valor) {
      setEditingDealId(null)
      return
    }

    const previousDeals = [...deals]
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, valor: numValue } : d))
    )
    setEditingDealId(null)

    try {
      await negociosService.updateNegocio(deal.id, { etapa: deal.etapa, valor: numValue })
    } catch (err) {
      console.error('Failed to save deal value:', err)
      setDeals(previousDeals)
    }
  }

  const handleOpenDetails = (phone: string, e: MouseEvent) => {
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
        console.error('Error fetching details:', err)
        setDetailsError('Erro ao carregar detalhes do lead. Tente novamente.')
        setDetailsLoading(false)
      })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setSelectedLead(null)
  }


  const dealsByColumn = useMemo(() => {
    const groups: { [key: string]: Negocio[] } = {
      'Sem Contato': [],
      'Contatado': [],
      'Qualificado': [],
      'Reunião Agendada': [],
      'KYC/COF/Contrato': [],
      'Ganho': [],
      'Perdido': [],
    }
    filteredDeals.forEach((deal) => {
      if (groups[deal.etapa] !== undefined) {
        groups[deal.etapa].push(deal)
      } else {
        groups['Sem Contato'].push(deal)
      }
    })
    return groups
  }, [filteredDeals])

  return (
    <div className="space-y-4 transition-colors duration-150">
      {/* Top Title Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">Funil de Negócios</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Acompanhe o funil de vendas. Arraste e solte os cartões para mudar a etapa do negócio.
          </p>
        </div>
        <button
          onClick={fetchDeals}
          className="flex items-center gap-1.5 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm h-8 px-3 rounded-md transition-colors duration-150"
        >
          <TrendingUp className="h-4 w-4 stroke-[1.5] text-[var(--text-secondary)]" />
          <span>Atualizar Funil</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Value */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Valor do Pipeline</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{formatCurrency(kpis.totalValue)}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Soma estimada de negócios</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <DollarSign className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 2: Counts */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Negócios Ativos</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.totalCount}</h3>
            <p className="text-xs text-[var(--text-secondary)]">Contatos mapeados no funil</p>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <TrendingUp className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>

        {/* KPI 3: Conversion Rate */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between transition-colors duration-150">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]">Taxa de Conversão</span>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{kpis.conversionRate}%</h3>
            <div className="w-24 bg-[var(--border)] h-1 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-[var(--accent)] h-full rounded-full"
                style={{ width: `${kpis.conversionRate}%` }}
              ></div>
            </div>
          </div>
          <div className="h-10 w-10 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
            <Award className="h-4 w-4 stroke-[1.5]" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex flex-col md:flex-row gap-3 items-center transition-colors duration-150">
        {/* Search */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-[var(--text-tertiary)] stroke-[1.5]" />
          <input
            type="text"
            placeholder="Buscar negócio por nome, telefone, e-mail..."
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

        {/* Campaign select */}
        <div className="relative w-full md:w-64">
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
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

        {/* Consultant select */}
        <div className="relative w-full md:w-64">
          <select
            value={selectedConsultant}
            onChange={(e) => setSelectedConsultant(e.target.value)}
            className="w-full h-8 pl-3 pr-8 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] appearance-none transition-colors duration-150"
          >
            <option value="all">Todos os Consultores</option>
            <option value="unassigned">Sem Consultor (Não atribuídos)</option>
            {consultantsList.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Filter className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-tertiary)] stroke-[1.5] pointer-events-none" />
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
          <span className="text-xs text-[var(--text-secondary)]">Carregando funil de vendas...</span>
        </div>
      ) : error ? (
        <div className="text-center py-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
          <p className="text-red-500 font-semibold text-sm">{error}</p>
          <button
            onClick={fetchDeals}
            className="mt-4 h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium rounded-md transition-colors duration-150"
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
                className="w-80 shrink-0 flex flex-col bg-[var(--background)] border border-[var(--border)] rounded-lg max-h-[700px] overflow-hidden transition-colors duration-150"
              >
                {/* Column Header */}
                <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)] flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{column.name}</span>
                    <span className="text-xs bg-[var(--surface)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                      {columnDeals.length}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Soma: {formatCurrency(columnTotalValue)}
                  </div>
                </div>

                {/* Column Card Body */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[450px]">
                  {columnDeals.length === 0 ? (
                    <div className="h-full flex items-center justify-center py-20 border border-dashed border-[var(--border)] rounded-md">
                      <span className="text-xs text-[var(--text-tertiary)]">Arraste um lead para cá</span>
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
                          className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-md p-3 space-y-2.5 cursor-grab active:cursor-grabbing transition-all duration-150 relative group"
                        >
                          {/* Top: Name & Quick view */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-6 w-6 rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border)] text-[10px] font-bold flex items-center justify-center shrink-0">
                                {initials}
                              </div>
                              <h4
                                onClick={(e) => handleOpenDetails(deal.phone, e)}
                                className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1 hover:text-[var(--accent-hover)] cursor-pointer transition-colors"
                              >
                                {deal.full_name || 'Sem Nome'}
                              </h4>
                            </div>

                            <button
                              onClick={(e) => handleOpenDetails(deal.phone, e)}
                              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors shrink-0"
                              title="Visualizar Detalhes"
                            >
                              <Eye className="h-3.5 w-3.5 stroke-[1.5]" />
                            </button>
                          </div>

                          {/* Campaign Label */}
                          <div className="text-[10px] bg-[var(--surface-raised)] text-[var(--text-secondary)] px-2 py-0.5 rounded border border-[var(--border)] block w-fit truncate max-w-full">
                            {deal.campaign_name || 'Campanha Direta'}
                          </div>

                          {/* Call classification tag */}
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide ${getStatusBadgeStyle(deal.status_chamada)}`}>
                              {deal.status_chamada}
                              <InfoTooltip text={getClassificationTooltipText(deal.status_chamada)} />
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)]">{deal.platform || 'Meta'}</span>
                          </div>
                          
                          {/* Agenda/Manual Tag from latest comment */}
                          {deal.call_anotacoes && deal.call_anotacoes.match(/^\[Tag: (.*?)\]/) && (
                            (() => {
                              const match = deal.call_anotacoes.match(/^\[Tag: (.*?)\]/);
                              const tagStr = match ? match[1] : null;
                              if (!tagStr) return null;
                              
                              let colorClass = "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400";
                              if (tagStr.includes('Tarefa')) colorClass = "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";
                              if (tagStr.includes('Chamada')) colorClass = "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
                              if (tagStr.includes('Reunião Realizada')) colorClass = "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400";

                              return (
                                <div className={`w-fit px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded shadow-sm border ${colorClass} mt-1`} title="Ação registrada na Agenda do Dia">
                                  {tagStr}
                                </div>
                              )
                            })()
                          )}

                          {/* Consultant Name */}
                          {deal.usuario_nome && (
                            <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 font-medium bg-[var(--surface-raised)]/40 px-2 py-0.5 rounded border border-dashed border-[var(--border)] w-fit max-w-full truncate">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                              <span className="truncate">Consultor: {deal.usuario_nome}</span>
                            </div>
                          )}

                          {/* Editable Custom Tags */}
                          {editingTagId === deal.id ? (
                            <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={editingTagValue}
                                onChange={(e) => {
                                  setEditingTagValue(e.target.value)
                                }}
                                className="w-full h-6 px-1.5 text-[10px] border border-[var(--accent)] rounded bg-[var(--surface)] focus:outline-none text-[var(--text-primary)]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setEditingTagId(null)
                                }}
                              >
                                <option value="">Sem Tag</option>
                                {availableTags.map(tag => (
                                  <option key={tag} value={tag}>{tag}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleSaveTag(deal)}
                                className="p-0.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded"
                              >
                                <Check className="h-3 w-3 stroke-[1.5]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {deal.tags ? (
                                deal.tags.split(',').map(t => t.trim()).filter(Boolean).map((t, idx) => (
                                  <div key={idx} className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 font-medium bg-[var(--surface-raised)]/40 px-2 py-0.5 rounded border border-dashed border-[var(--border)] w-fit max-w-full truncate cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors" onClick={(e) => handleStartEditTag(deal, e)} title="Clique para editar as tags">
                                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0"></span>
                                    <span className="truncate">{t}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 font-medium bg-[var(--surface)] px-2 py-0.5 rounded border border-dashed border-[var(--border)] w-fit max-w-full truncate cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors" onClick={(e) => handleStartEditTag(deal, e)} title="Clique para adicionar tags">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  <span className="truncate">Adicionar Tag</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Editable Value Box */}
                          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                            {isEditingValue ? (
                              <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                <span className="text-xs text-[var(--text-secondary)] font-bold">R$</span>
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  className="w-16 h-6 px-1.5 text-xs border border-[var(--accent)] rounded bg-[var(--surface)] focus:outline-none text-[var(--text-primary)] font-semibold"
                                  autoFocus
                                  placeholder="0"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveValue(deal)
                                    if (e.key === 'Escape') setEditingDealId(null)
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveValue(deal)}
                                  className="p-0.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded"
                                >
                                  <Check className="h-3 w-3 stroke-[1.5]" />
                                </button>
                                <button
                                  onClick={() => setEditingDealId(null)}
                                  className="p-0.5 bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] rounded"
                                >
                                  <X className="h-3 w-3 stroke-[1.5]" />
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={(e) => handleStartEditValue(deal, e)}
                                className="flex items-center gap-1 cursor-pointer text-xs font-bold text-emerald-600 dark:text-emerald-450 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-1.5 py-0.5 rounded transition duration-150"
                                title="Clique para editar o valor"
                              >
                                <span>{deal.valor > 0 ? formatCurrency(deal.valor) : 'Definir Valor'}</span>
                                <Edit2 className="h-2.5 w-2.5 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            )}

                            {/* Stage Shifter Arrows for Mobile/No-drag accessibility */}
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveDealStage(deal, 'left')
                                }}
                                className="p-0.5 border border-[var(--border)] rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                                disabled={column.id === COLUMNS[0].id}
                                title="Mover para Etapa Anterior"
                              >
                                <ChevronLeft className="h-3 w-3 stroke-[1.5]" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveDealStage(deal, 'right')
                                }}
                                className="p-0.5 border border-[var(--border)] rounded bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                                disabled={column.id === COLUMNS[COLUMNS.length - 1].id}
                                title="Mover para Próxima Etapa"
                              >
                                <ChevronRight className="h-3 w-3 stroke-[1.5]" />
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
            className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={closeDrawer}
          />

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
                      onClick={(e) => handleOpenDetails(selectedLead?.phone || '', e)}
                      className="mt-4 h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-medium rounded-md transition-colors duration-150"
                    >
                      Recarregar
                    </button>
                  </div>
                ) : selectedLead ? (
                  <>
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

                      <WhatsAppTemplateSelector
                        phone={selectedLead.phone}
                        leadName={selectedLead.full_name}
                        campaignName={selectedLead.campaign_name}
                      />
                    </div>

                    {/* Tag System in Drawer */}
                    <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-4 space-y-3 transition-colors duration-150">
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Registrar Ação / Tag</h4>
                      <div className="flex flex-wrap gap-2">
                        {['Tarefa', 'Chamada', 'Reunião Realizada'].map(tag => (
                          <button
                            key={tag}
                            onClick={() => {
                              setDrawerTag(prev => prev === tag ? '' : tag)
                              setDrawerTagDate('')
                              setDrawerTagTime('')
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${drawerTag === tag ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800' : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--surface-hover)]'}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                      
                      {(drawerTag === 'Tarefa' || drawerTag === 'Chamada') && (
                        <div className="animate-in fade-in slide-in-from-top-1 mt-2 space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                              Data da {drawerTag} {drawerTag === 'Tarefa' ? '(Obrigatória)' : '(Opcional)'}
                            </label>
                            <input 
                              type="date"
                              value={drawerTagDate}
                              onChange={(e) => setDrawerTagDate(e.target.value)}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                              Horário da {drawerTag} {drawerTagDate ? '(Obrigatório)' : '(Opcional)'}
                            </label>
                            <input 
                              type="time"
                              value={drawerTagTime}
                              onChange={(e) => setDrawerTagTime(e.target.value)}
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm"
                            />
                          </div>
                        </div>
                      )}

                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          placeholder="Comentário opcional..."
                          value={drawerComment}
                          onChange={(e) => setDrawerComment(e.target.value)}
                          className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm"
                        />
                        <button
                          onClick={async () => {
                            if (!drawerTag && !drawerComment) return
                            if (!selectedLead?.phone) return
                            setIsSubmittingTag(true)
                            try {
                              let fullComment = drawerComment
                              if (drawerTag) {
                                fullComment = `[Tag: ${drawerTag}${drawerTagDate ? ` - Data: ${drawerTagDate}` : ''}${drawerTagTime ? ` - Horário: ${drawerTagTime}` : ''}] ${fullComment}`
                              }
                              
                              const today = new Date()
                              const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                              await agendaService.addComment(selectedLead.phone, dateStr, fullComment, user?.email || 'Usuário')
                              
                              alert('Ação registrada com sucesso!')
                              
                              const targetDate = drawerTagDate
                              setDrawerTag('')
                              setDrawerTagDate('')
                              setDrawerTagTime('')
                              setDrawerComment('')
                              
                              if ((drawerTag === 'Tarefa' || drawerTag === 'Chamada') && targetDate) {
                                setDrawerOpen(false)
                                navigate(`/agenda?date=${targetDate}`)
                              }
                            } catch (e) {
                              alert('Erro ao registrar ação')
                            } finally {
                              setIsSubmittingTag(false)
                            }
                          }}
                          disabled={
                            !!(
                              isSubmittingTag ||
                              (!drawerTag && !drawerComment) ||
                              (drawerTag === 'Tarefa' && (!drawerTagDate || !drawerTagTime)) ||
                              (drawerTag === 'Chamada' && ((drawerTagDate && !drawerTagTime) || (!drawerTagDate && drawerTagTime)))
                            )
                          }
                          className="px-3 bg-[var(--text-primary)] text-[var(--surface)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Volume2 className="h-4 w-4 stroke-[1.5]" />
                        <span>Histórico de Chamadas ({selectedLead.chamadas?.length || 0})</span>
                      </h4>

                      {!selectedLead.chamadas || selectedLead.chamadas.length === 0 ? (
                        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-lg bg-[var(--surface-raised)]">
                          <Phone className="h-6 w-6 text-[var(--text-tertiary)] mx-auto mb-2 stroke-[1.5]" />
                          <p className="text-xs text-[var(--text-secondary)] font-normal">Este lead ainda não recebeu nenhuma ligação de contato.</p>
                        </div>
                      ) : (
                        <div className="relative pl-4 border-l border-[var(--border)] space-y-4 ml-2">
                          {selectedLead.chamadas.map((call, idx) => {
                            const { classif, subcat, score } = classifyCall(call)
                            return (
                              <div key={call.id || idx} className="relative">
                                <div className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-[var(--accent)] animate-none"></div>

                                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-md p-3.5 space-y-2 transition-colors duration-150">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-[var(--border)] pb-2">
                                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                                      {formatDate(call.data_hora)}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${getStatusBadgeStyle(classif)}`}>
                                        {classif}
                                        <InfoTooltip text={getClassificationTooltipText(classif)} />
                                      </span>
                                      {subcat && subcat !== classif && (
                                        <span className="text-[10px] text-[var(--text-secondary)]">({subcat})</span>
                                      )}
                                      {score && (
                                        <div className="flex items-center gap-0.5 text-amber-500 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-200/50">
                                          <Star className="h-3 w-3 fill-amber-500 stroke-[1.5]" />
                                          <span>{score}/8</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                                    <div>
                                      Duração: <span className="font-semibold text-[var(--text-primary)]">{formatDuration(call.duracao_segundos)}</span>
                                    </div>
                                    <div className="text-right">
                                      Origem: <span className="font-semibold text-[var(--text-primary)]">{call.source_file ? call.source_file.replace('.csv', '') : 'Manual'}</span>
                                    </div>
                                  </div>

                                  {call.resumo_ligacao && (
                                    <div className="bg-[var(--surface-raised)] border-l-2 border-[var(--accent)] p-2.5 rounded-r-md space-y-1">
                                      <div className="text-[10px] font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1">
                                        <Sparkles className="h-3.5 w-3.5 text-[var(--text-secondary)] stroke-[1.5]" />
                                        <span>Resumo de IA</span>
                                      </div>
                                      <p className="text-xs italic text-[var(--text-primary)] leading-relaxed">
                                        "{call.resumo_ligacao}"
                                      </p>
                                    </div>
                                  )}

                                  {call.tag && (
                                    <div className="flex flex-wrap gap-1">
                                      {call.tag.split(',').map((t, tIdx) => (
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
                                    <div className="text-xs bg-[var(--surface-raised)] p-2 rounded border border-[var(--border)] text-[var(--text-primary)]">
                                      <span className="font-semibold block mb-0.5">Anotações:</span>
                                      {call.anotacoes}
                                    </div>
                                  )}

                                  {/* Audio Player */}
                                  {call.link_gravacao && (
                                    <div className="pt-1">
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

      {/* Loss Reason Modal */}
      {lossModalOpen && lossDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden text-[var(--text-primary)] transition-colors duration-150 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Confirmar Perda de Negócio</h3>
                <p className="text-xs text-[var(--text-secondary)]">Lead: {lossDeal.full_name}</p>
              </div>
              <button
                onClick={closeLossModal}
                className="p-1 rounded-md border border-[var(--border)] bg-transparent hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
              >
                <X className="h-4 w-4 stroke-[1.5]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                  Motivo da Perda
                </label>
                <select
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                  className="w-full h-9 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                >
                  <option value="" disabled>Selecione um motivo</option>
                  <option value="Atividade Conflitante">Atividade Conflitante - Atua na concorrência e não aceita exclusividade</option>
                  <option value="Contato Incorreto ou Inexistente">Contato Incorreto ou Inexistente - Tentativas de contato sem sucesso</option>
                  <option value="Discordância da COF">Discordância da COF - Cláusulas não validadas</option>
                  <option value="Discordância do Contrato de Franquias">Discordância do Contrato de Franquias - Cláusulas não validadas</option>
                  <option value="Dicordância das Diretrizes da Franqueadora">Dicordância das Diretrizes da Franqueadora - Risco conflito com a franqueadora</option>
                  <option value="Falta de Capital para Investimento">Falta de Capital para Investimento - Sem capital</option>
                  <option value="Já temos Franqueado na Região">Já temos Franqueado na Região - Território ocupado</option>
                  <option value="Lead deixou de Retornar Contatos">Lead deixou de Retornar Contatos - Sem retorno</option>
                  <option value="Lead Desinteressado">Lead Desinteressado - Modelo de negócio não aderente</option>
                  <option value="Lead Desistente">Lead Desistente - Perspectiva financeira incompatível para o Lead</option>
                  <option value="Não Aprovado pela Franqueadora">Não Aprovado pela Franqueadora - KYC | Compliance</option>
                  <option value="Fit Cultural">Fit Cultural - Não adequado à cultura da franqueadora / Perfil não aderente</option>
                  <option value="Lead Duplicado">Lead Duplicado - Duplicidade de registro</option>
                  <option value="Lead Cidade >= 50K Habitantes">Lead Cidade &gt;= 50K Habitantes - Não atende premissa máxima população na região</option>
                  <option value="Registro Indevido ou Desconhecido">Registro Indevido ou Desconhecido - Alega não ter preenchido o formulário</option>
                  <option value="Não Enviou Documentação">Não Enviou Documentação - Desistência na etapa documental</option>
                  <option value="Reprovado em KYC">Reprovado em KYC - KYC</option>
                  <option value="Alta Expectativa Financeira">Alta Expectativa Financeira - Perfil não aderente</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                  Observações / Comentários
                </label>
                <textarea
                  value={lossComment}
                  onChange={(e) => setLossComment(e.target.value)}
                  placeholder="Descreva detalhes sobre o motivo de perda..."
                  rows={3}
                  className="w-full p-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-end gap-2">
              <button
                onClick={closeLossModal}
                className="h-9 px-4 border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium rounded-md transition-colors duration-150 bg-transparent hover:bg-[var(--surface)]"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (lossCallback && lossReason) {
                    lossCallback(lossReason, lossComment)
                  }
                }}
                disabled={!lossReason}
                className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors duration-150 disabled:opacity-50"
              >
                Confirmar Perda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FileText(props: React.SVGProps<SVGSVGElement>) {
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
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}
