import { useState, useEffect, useMemo } from 'react'
import { leadsService } from '../services/leads'
import { usuariosService } from '../services/usuarios'
import type { Usuario } from '../services/usuarios'
import { campanhasService } from '../services/campanhas'
import type { CampanhasResponse } from '../services/campanhas'
import type { Lead } from '../types/lead'
import {
  Search,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  UserCheck,
  Tag,
  CheckCircle2,
  AlertTriangle,
  Users,
  SlidersHorizontal,
  Mail,
  Phone,
  MapPin,
  Globe,
  User
} from 'lucide-react'

// Helper badge styles for lead/call status
const getStatusBadgeStyle = (status?: string | null) => {
  if (!status) return 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50'
  
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

export default function EdicaoLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  // Options for dropdowns
  const [usersList, setUsersList] = useState<Usuario[]>([])
  const [campaignsList, setCampaignsList] = useState<CampanhasResponse[]>([])

  // Filter state
  const [search, setSearch] = useState('')
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [selectedConsultant, setSelectedConsultant] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')

  // Selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<(string | number)[]>([])

  // Modal states
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    city: '',
    campaign_name: '',
    platform: '',
    consultant_email: ''
  })

  // Bulk Action States
  const [bulkConsultant, setBulkConsultant] = useState('')
  const [isSubmittingBulkConsultant, setIsSubmittingBulkConsultant] = useState(false)
  
  const [bulkCampaign, setBulkCampaign] = useState('')
  const [isSubmittingBulkCampaign, setIsSubmittingBulkCampaign] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Notification Toast state
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Fetch users & campaigns on mount
  useEffect(() => {
    usuariosService.list()
      .then(data => setUsersList(data))
      .catch(err => console.error('Erro ao carregar usuários:', err))

    campanhasService.getCampanhas()
      .then(data => setCampaignsList(data))
      .catch(err => console.error('Erro ao carregar campanhas:', err))
  }, [])

  // Fetch leads on filter or pagination change
  const fetchLeads = async () => {
    setIsLoading(true)
    try {
      const data = await leadsService.getLeads({
        page,
        page_size: pageSize,
        search: search || undefined,
        campanha_id: selectedCampaign || undefined,
        consultant: selectedConsultant || undefined,
        status: selectedStatus || undefined
      })
      setLeads(data.leads || [])
      setTotalLeads(data.total || 0)
      setTotalPages(data.pages || 1)
    } catch (err) {
      console.error('Erro ao carregar leads:', err)
      showToast('Erro ao carregar lista de leads', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
  }, [page, pageSize, search, selectedCampaign, selectedConsultant, selectedStatus])

  // Select all handler for current page
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = leads.map(l => l.id)
      const combined = Array.from(new Set([...selectedLeadIds, ...pageIds]))
      setSelectedLeadIds(combined)
    } else {
      const pageIdsSet = new Set<string | number>(leads.map(l => l.id))
      setSelectedLeadIds(selectedLeadIds.filter(id => !pageIdsSet.has(id)))
    }
  }

  const isAllPageSelected = useMemo(() => {
    if (leads.length === 0) return false
    return leads.every(l => selectedLeadIds.includes(l.id))
  }, [leads, selectedLeadIds])

  const toggleSelectLead = (id: string | number) => {
    if (selectedLeadIds.includes(id)) {
      setSelectedLeadIds(selectedLeadIds.filter(item => item !== id))
    } else {
      setSelectedLeadIds([...selectedLeadIds, id])
    }
  }

  // Open Edit Modal
  const handleOpenEditModal = (lead: Lead) => {
    setEditingLead(lead)
    setEditFormData({
      full_name: lead.full_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      campaign_name: lead.campaign_name || '',
      platform: lead.platform || '',
      consultant_email: lead.usuario_email || ''
    })
  }

  // Submit Single Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLead) return
    setIsSavingEdit(true)
    try {
      await leadsService.updateLead(editingLead.id, {
        full_name: editFormData.full_name,
        phone: editFormData.phone,
        email: editFormData.email,
        city: editFormData.city,
        campaign_name: editFormData.campaign_name,
        platform: editFormData.platform,
        consultant_email: editFormData.consultant_email,
        usuario_email: editFormData.consultant_email
      })
      showToast('Lead atualizado com sucesso!', 'success')
      setEditingLead(null)
      fetchLeads()
    } catch (err) {
      console.error('Erro ao atualizar lead:', err)
      showToast('Falha ao atualizar lead.', 'error')
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Reassign Consultant Bulk
  const handleBulkReassignConsultant = async () => {
    if (!bulkConsultant || selectedLeadIds.length === 0) return
    setIsSubmittingBulkConsultant(true)
    try {
      await leadsService.bulkUpdateLeads(selectedLeadIds, {
        consultant_email: bulkConsultant,
        usuario_email: bulkConsultant
      })
      showToast(`${selectedLeadIds.length} lead(s) reatribuído(s) com sucesso!`, 'success')
      setBulkConsultant('')
      setSelectedLeadIds([])
      fetchLeads()
    } catch (err) {
      console.error('Erro ao reatribuir consultor:', err)
      showToast('Erro ao reatribuir consultor para os leads.', 'error')
    } finally {
      setIsSubmittingBulkConsultant(false)
    }
  }

  // Update Campaign Bulk
  const handleBulkUpdateCampaign = async () => {
    if (!bulkCampaign || selectedLeadIds.length === 0) return
    setIsSubmittingBulkCampaign(true)
    try {
      await leadsService.bulkUpdateLeads(selectedLeadIds, {
        campaign_name: bulkCampaign
      })
      showToast(`Campanha alterada para ${selectedLeadIds.length} lead(s)!`, 'success')
      setBulkCampaign('')
      setSelectedLeadIds([])
      fetchLeads()
    } catch (err) {
      console.error('Erro ao alterar campanha:', err)
      showToast('Erro ao alterar campanha dos leads.', 'error')
    } finally {
      setIsSubmittingBulkCampaign(false)
    }
  }

  // Delete Bulk
  const handleConfirmBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return
    setIsDeleting(true)
    try {
      await leadsService.bulkDeleteLeads(selectedLeadIds)
      showToast(`${selectedLeadIds.length} lead(s) excluído(s) com sucesso!`, 'success')
      setDeleteModalOpen(false)
      setSelectedLeadIds([])
      fetchLeads()
    } catch (err) {
      console.error('Erro ao excluir leads:', err)
      showToast('Erro ao excluir leads selecionados.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const hasActiveFilters = search || selectedCampaign || selectedConsultant || selectedStatus

  const clearFilters = () => {
    setSearch('')
    setSelectedCampaign('')
    setSelectedConsultant('')
    setSelectedStatus('')
    setPage(1)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/90 dark:text-red-300 dark:border-red-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500" />
          )}
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 hover:opacity-75 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Edit className="w-6 h-6 text-[var(--accent)]" />
            Edição de Leads
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Gerencie, edite individualmente ou atualize em massa os dados dos leads.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Campaign Filter */}
          <div className="relative">
            <select
              value={selectedCampaign}
              onChange={(e) => {
                setSelectedCampaign(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer"
            >
              <option value="">Todas as Campanhas</option>
              {campaignsList.map((c) => (
                <option key={c.campaign_id} value={c.campaign_name}>
                  {c.campaign_name} ({c.platform})
                </option>
              ))}
            </select>
          </div>

          {/* Consultant Filter */}
          <div className="relative">
            <select
              value={selectedConsultant}
              onChange={(e) => {
                setSelectedConsultant(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer"
            >
              <option value="">Todos os Consultores</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer"
            >
              <option value="">Todos os Status</option>
              <option value="Agendou Reunião">Agendou Reunião</option>
              <option value="Lead Qualificado">Lead Qualificado</option>
              <option value="Sem Ligação">Sem Ligação</option>
              <option value="Caixa Postal / Não Atendido">Caixa Postal / Não Atendido</option>
              <option value="Sem Interesse">Sem Interesse</option>
              <option value="Lead Desqualificado">Lead Desqualificado</option>
              <option value="Retorno Agendado">Retorno Agendado</option>
            </select>
          </div>
        </div>

        {/* Clear Filters indicator */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <span>Filtros ativos aplicados</span>
            <button
              onClick={clearFilters}
              className="text-[var(--accent)] hover:underline flex items-center gap-1 font-medium"
            >
              <X className="w-3.5 h-3.5" />
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Table Section */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-[var(--text-secondary)]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-secondary)] space-y-3">
            <SlidersHorizontal className="w-12 h-12 mx-auto text-[var(--text-tertiary)] opacity-50" />
            <p className="text-base font-medium">Nenhum lead encontrado</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Tente alterar os termos de busca ou remover os filtros aplicados.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[var(--background)] border-b border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    <th className="p-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllPageSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-400 text-[var(--accent)] focus:ring-[var(--accent)] h-4 w-4 cursor-pointer"
                      />
                    </th>
                    <th className="p-4">Lead</th>
                    <th className="p-4">Cidade</th>
                    <th className="p-4">Campanha / Plataforma</th>
                    <th className="p-4">Consultor Atribuído</th>
                    <th className="p-4">Status Chamada/Lead</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  {leads.map((lead) => {
                    const isSelected = selectedLeadIds.includes(lead.id)
                    return (
                      <tr
                        key={lead.id}
                        className={`hover:bg-[var(--surface-raised)] transition-colors duration-150 ${
                          isSelected ? 'bg-[var(--accent-hover)]/10' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLead(lead.id)}
                            className="rounded border-gray-400 text-[var(--accent)] focus:ring-[var(--accent)] h-4 w-4 cursor-pointer"
                          />
                        </td>

                        {/* Lead Info */}
                        <td className="p-4 font-medium">
                          <div className="flex flex-col">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {lead.full_name || 'Sem Nome'}
                            </span>
                            <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-0.5">
                              {lead.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-[var(--text-tertiary)]" />
                                  {lead.phone}
                                </span>
                              )}
                              {lead.email && (
                                <span className="flex items-center gap-1 truncate max-w-[180px]">
                                  <Mail className="w-3 h-3 text-[var(--text-tertiary)]" />
                                  {lead.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* City */}
                        <td className="p-4 text-xs text-[var(--text-secondary)]">
                          {lead.city ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                              {lead.city}
                            </span>
                          ) : (
                            <span className="text-[var(--text-tertiary)]">-</span>
                          )}
                        </td>

                        {/* Campaign / Platform */}
                        <td className="p-4 text-xs">
                          <div className="flex flex-col">
                            <span className="font-medium text-[var(--text-primary)]">
                              {lead.campaign_name || '-'}
                            </span>
                            {lead.platform && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] mt-0.5">
                                <Globe className="w-3 h-3" />
                                {lead.platform}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Consultant */}
                        <td className="p-4 text-xs">
                          {lead.usuario_nome || lead.usuario_email ? (
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-[var(--accent)]" />
                              <span className="font-medium">
                                {lead.usuario_nome || lead.usuario_email}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--text-tertiary)] italic">Não atribuído</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="p-4 text-xs">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-block ${getStatusBadgeStyle(
                              lead.status_chamada || lead.lead_status
                            )}`}
                          >
                            {lead.status_chamada || lead.lead_status || 'Sem Status'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleOpenEditModal(lead)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors duration-150"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Editar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-2">
                <span>Exibindo</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded text-[var(--text-primary)] focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>de {totalLeads} leads</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded border border-[var(--border)] hover:bg-[var(--surface-raised)] disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-medium text-[var(--text-primary)]">
                  Página {page} de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded border border-[var(--border)] hover:bg-[var(--surface-raised)] disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal de Edição Manual */}
      {editingLead && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setEditingLead(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                  <Edit className="w-4 h-4 text-[var(--accent)]" />
                  Editar Lead #{editingLead.id}
                </h3>
                <button
                  onClick={() => setEditingLead(null)}
                  className="p-1 rounded hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.full_name}
                      onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Telefone
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* City */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={editFormData.city}
                      onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* Platform */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Plataforma
                    </label>
                    <input
                      type="text"
                      value={editFormData.platform}
                      onChange={(e) => setEditFormData({ ...editFormData, platform: e.target.value })}
                      placeholder="Ex: Meta, Google, Organico"
                      className="w-full px-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* Campaign Name */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Nome da Campanha
                    </label>
                    <input
                      type="text"
                      value={editFormData.campaign_name}
                      onChange={(e) => setEditFormData({ ...editFormData, campaign_name: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* Consultant */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      Consultor Atribuído
                    </label>
                    <select
                      value={editFormData.consultant_email}
                      onChange={(e) => setEditFormData({ ...editFormData, consultant_email: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                    >
                      <option value="">Nenhum consultor atribuído</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.email}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setEditingLead(null)}
                    className="flex-1 py-2 px-4 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex-1 py-2 px-4 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {isSavingEdit ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      'Salvar Alterações'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Bulk Delete Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setDeleteModalOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 text-red-600">
                <div className="p-2 bg-red-100 dark:bg-red-950/40 rounded-full">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Excluir {selectedLeadIds.length} lead(s)?
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">Esta ação é irreversível.</p>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)]">
                Você está prestes a remover permanentemente <strong>{selectedLeadIds.length}</strong> lead(s) selecionado(s). Tem certeza que deseja continuar?
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="flex-1 py-2 px-4 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmBulkDelete}
                  className="flex-1 py-2 px-4 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    'Confirmar Exclusão'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Actions Bar */}
      {selectedLeadIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#111827] border border-gray-700 text-white rounded-xl shadow-2xl px-5 py-3.5 flex flex-wrap items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 max-w-4xl w-[92%] sm:w-auto">
          {/* Badge & Clear Selection */}
          <div className="flex items-center gap-2 border-r border-gray-700 pr-4">
            <span className="bg-[var(--accent)] text-xs font-bold px-2.5 py-1 rounded-full text-white flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {selectedLeadIds.length} selecionado(s)
            </span>
            <button
              onClick={() => setSelectedLeadIds([])}
              className="text-gray-400 hover:text-white p-1 rounded transition-colors text-xs flex items-center gap-1"
              title="Limpar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Reassign Consultant Action */}
          <div className="flex items-center gap-2">
            <select
              value={bulkConsultant}
              onChange={(e) => setBulkConsultant(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--accent)] cursor-pointer max-w-[160px]"
            >
              <option value="">Reatribuir Consultor...</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name}
                </option>
              ))}
            </select>
            <button
              disabled={!bulkConsultant || isSubmittingBulkConsultant}
              onClick={handleBulkReassignConsultant}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1"
            >
              <UserCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
              Aplicar
            </button>
          </div>

          {/* Alter Campaign Action */}
          <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
            <input
              type="text"
              placeholder="Nova Campanha..."
              value={bulkCampaign}
              onChange={(e) => setBulkCampaign(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--accent)] w-36"
            />
            <button
              disabled={!bulkCampaign || isSubmittingBulkCampaign}
              onClick={handleBulkUpdateCampaign}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1"
            >
              <Tag className="w-3.5 h-3.5 text-[var(--accent)]" />
              Aplicar
            </button>
          </div>

          {/* Delete Action */}
          <div className="border-l border-gray-700 pl-4">
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="bg-red-600/80 hover:bg-red-600 text-xs text-white px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
