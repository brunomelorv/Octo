import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserPlus,
  Trash2,
  ArrowUpRight,
  Loader2,
  MapPin,
  RefreshCw,
  Users,
} from 'lucide-react'
import { leadsService } from '../services/leads'
import type { Lead } from '../types/lead'
import LeadFormModal from './LeadFormModal'
import ConfirmDeleteModal from './ConfirmDeleteModal'

/** How many leads the inline panel loads. Beyond this the user is sent to the Leads page. */
const PANEL_PAGE_SIZE = 25

interface CampaignLeadsPanelProps {
  campaignId: string
  campaignName: string
  canManage: boolean
  onToast: (message: string, type: 'success' | 'error') => void
  /** Called after a create/delete so the parent can refresh campaign counters. */
  onLeadsChanged: () => void
}

export default function CampaignLeadsPanel({
  campaignId,
  campaignName,
  canManage,
  onToast,
  onLeadsChanged,
}: CampaignLeadsPanelProps) {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchLeads = useCallback(() => {
    setLoading(true)
    leadsService
      .getLeads({ campanha_id: campaignId, page: 1, page_size: PANEL_PAGE_SIZE })
      .then((data) => {
        setLeads(data.items || [])
        setTotal(data.total || 0)
        setError(null)
      })
      .catch((err) => {
        console.error('Erro ao carregar leads da campanha:', err)
        setError('Erro ao carregar os leads desta campanha.')
      })
      .finally(() => setLoading(false))
  }, [campaignId])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.includes(l.id))

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : leads.map((l) => l.id))
  }

  const handleCreated = (leadName: string) => {
    onToast(`Lead "${leadName}" cadastrado em ${campaignName}.`, 'success')
    setSelectedIds([])
    fetchLeads()
    onLeadsChanged()
  }

  const handleConfirmDelete = async () => {
    const ids = deleteTarget ? [deleteTarget.id] : selectedIds
    if (ids.length === 0) return

    setIsDeleting(true)
    try {
      if (ids.length === 1) {
        await leadsService.deleteLead(ids[0])
      } else {
        await leadsService.bulkDeleteLeads(ids)
      }
      onToast(
        ids.length === 1 ? 'Lead excluído com sucesso!' : `${ids.length} leads excluídos com sucesso!`,
        'success'
      )
      setDeleteOpen(false)
      setDeleteTarget(null)
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
      fetchLeads()
      onLeadsChanged()
    } catch (err: any) {
      console.error('Erro ao excluir lead(s):', err)
      onToast(err?.response?.data?.detail || 'Erro ao excluir lead(s).', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="bg-[var(--surface-raised)] border-t border-[var(--border)] px-4 py-3 space-y-3">
      {/* Panel toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Users className="h-3.5 w-3.5 stroke-[1.5]" />
          <span>
            Leads desta campanha
            {!loading && !error && (
              <span className="ml-1 normal-case tracking-normal font-normal">
                ({total.toLocaleString('pt-BR')})
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canManage && selectedIds.length > 0 && (
            <button
              onClick={() => {
                setDeleteTarget(null)
                setDeleteOpen(true)
              }}
              className="h-7 px-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors duration-150 inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
              <span>Excluir selecionados ({selectedIds.length})</span>
            </button>
          )}
          <button
            onClick={fetchLeads}
            title="Recarregar leads"
            className="h-7 w-7 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors duration-150 inline-flex items-center justify-center"
          >
            <RefreshCw className="h-3.5 w-3.5 stroke-[1.5]" />
          </button>
          {canManage && (
            <button
              onClick={() => setCreateOpen(true)}
              className="h-7 px-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-medium rounded-md transition-colors duration-150 inline-flex items-center gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5 stroke-[1.5]" />
              <span>Adicionar lead</span>
            </button>
          )}
          <button
            onClick={() => navigate(`/leads?campaign_id=${encodeURIComponent(campaignId)}`)}
            className="h-7 px-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium rounded-md transition-colors duration-150 inline-flex items-center gap-1"
          >
            <span>Ver todos</span>
            <ArrowUpRight className="h-3 w-3 stroke-[1.5]" />
          </button>
        </div>
      </div>

      {/* Leads list */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
          <span>Carregando leads...</span>
        </div>
      ) : error ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-xs text-red-500">{error}</p>
          <button
            onClick={fetchLeads}
            className="h-7 px-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-xs rounded-md hover:bg-[var(--surface-raised)] transition-colors duration-150"
          >
            Tentar novamente
          </button>
        </div>
      ) : leads.length === 0 ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">
            Nenhum lead cadastrado nesta campanha ainda.
          </p>
          {canManage && (
            <button
              onClick={() => setCreateOpen(true)}
              className="h-7 px-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-medium rounded-md transition-colors duration-150 inline-flex items-center gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5 stroke-[1.5]" />
              <span>Cadastrar o primeiro lead</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="border border-[var(--border)] rounded-md overflow-hidden bg-[var(--surface)]">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  {canManage && (
                    <th className="pl-3 pr-0 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        aria-label="Selecionar todos os leads listados"
                        className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--accent)] cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Cidade</th>
                  <th className="px-3 py-2">Dono</th>
                  {canManage && <th className="px-3 py-2 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="text-[var(--text-primary)]">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-raised)] transition-colors duration-150"
                  >
                    {canManage && (
                      <td className="pl-3 pr-0 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(lead.id)}
                          onChange={() => toggleSelected(lead.id)}
                          aria-label={`Selecionar ${lead.full_name || 'lead'}`}
                          className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--accent)] cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className="font-medium truncate block max-w-[200px]">
                        {lead.full_name || 'Sem nome'}
                      </span>
                      {lead.email && (
                        <span className="text-[10px] text-[var(--text-secondary)] truncate block max-w-[200px]">
                          {lead.email}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.phone || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                        <MapPin className="h-3 w-3 stroke-[1.5] shrink-0" />
                        <span className="truncate max-w-[110px]">{lead.city || 'Desconhecida'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)] truncate max-w-[120px]">
                      {lead.usuario_nome || '-'}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            setDeleteTarget(lead)
                            setDeleteOpen(true)
                          }}
                          title="Excluir lead"
                          aria-label={`Excluir ${lead.full_name || 'lead'}`}
                          className="h-6 w-6 text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-900/40 rounded transition-colors duration-150 inline-flex items-center justify-center bg-transparent"
                        >
                          <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > leads.length && (
            <p className="text-[11px] text-[var(--text-secondary)]">
              Exibindo os {leads.length} leads mais recentes de {total.toLocaleString('pt-BR')}. Use
              "Ver todos" para a lista completa.
            </p>
          )}
        </>
      )}

      <LeadFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        fixedCampaign={{ campaign_id: campaignId, campaign_name: campaignName }}
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        count={deleteTarget ? 1 : selectedIds.length}
        leadName={deleteTarget?.full_name}
        deleting={isDeleting}
        onCancel={() => {
          setDeleteOpen(false)
          setDeleteTarget(null)
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
