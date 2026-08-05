import { useState, useEffect } from 'react'
import { X, UserPlus, Loader2, AlertCircle } from 'lucide-react'
import { leadsService } from '../services/leads'
import type { CampanhasResponse } from '../services/campanhas'
import type { Usuario } from '../services/usuarios'

interface LeadFormModalProps {
  open: boolean
  onClose: () => void
  onCreated: (leadName: string) => void
  /** Campaign list for the selector. Omit when the campaign is fixed. */
  campaigns?: CampanhasResponse[]
  /** Consultants available for direct assignment. Optional. */
  consultants?: Usuario[]
  /** Pre-selects (and locks) the campaign — used when creating from within a campaign. */
  fixedCampaign?: { campaign_id: string; campaign_name: string } | null
}

const emptyForm = {
  full_name: '',
  phone: '',
  email: '',
  city: '',
  campaign_id: '',
  consultant_email: '',
}

export default function LeadFormModal({
  open,
  onClose,
  onCreated,
  campaigns = [],
  consultants = [],
  fixedCampaign = null,
}: LeadFormModalProps) {
  const [form, setForm] = useState({ ...emptyForm })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the form each time the modal opens so leftover values never carry over.
  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, campaign_id: fixedCampaign?.campaign_id || '' })
      setError(null)
      setSubmitting(false)
    }
  }, [open, fixedCampaign?.campaign_id])

  if (!open) return null

  const setField = (key: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    if (!form.full_name.trim()) {
      setError('Informe o nome do lead.')
      return
    }
    if (!form.phone.trim()) {
      setError('Informe o telefone do lead.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload: Record<string, string> = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
      }
      if (form.email.trim()) payload.email = form.email.trim()
      if (form.city.trim()) payload.city = form.city.trim()
      if (form.consultant_email) payload.consultant_email = form.consultant_email

      if (fixedCampaign) {
        payload.campaign_id = fixedCampaign.campaign_id
        payload.campaign_name = fixedCampaign.campaign_name
      } else if (form.campaign_id) {
        payload.campaign_id = form.campaign_id
        const match = campaigns.find((c) => c.campaign_id === form.campaign_id)
        if (match?.campaign_name) payload.campaign_name = match.campaign_name
      }

      await leadsService.createLead(payload as any)
      onCreated(payload.full_name)
      onClose()
    } catch (err: any) {
      // The backend returns human-readable messages in `detail` for validation errors.
      setError(err?.response?.data?.detail || 'Erro ao cadastrar o lead. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full h-8 px-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150'
  const labelClass = 'text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={submitting ? undefined : onClose} />

      <div className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-primary)]">
              <UserPlus className="h-4 w-4 stroke-[1.5]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Cadastrar Lead</h3>
              {fixedCampaign && (
                <p className="text-xs text-[var(--text-secondary)] truncate max-w-[320px]">
                  Campanha: {fixedCampaign.campaign_name}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 bg-transparent"
          >
            <X className="h-4 w-4 stroke-[1.5]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle className="h-4 w-4 stroke-[1.5] shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className={labelClass} htmlFor="lead-name">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                id="lead-name"
                autoFocus
                value={form.full_name}
                onChange={(e) => setField('full_name', e.target.value)}
                placeholder="Nome completo do lead"
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass} htmlFor="lead-phone">
                Telefone <span className="text-red-500">*</span>
              </label>
              <input
                id="lead-phone"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="11987654321"
                className={inputClass}
              />
              <p className="text-[11px] text-[var(--text-tertiary)]">DDD + número. O +55 é aplicado automaticamente.</p>
            </div>

            <div className="space-y-1">
              <label className={labelClass} htmlFor="lead-email">E-mail</label>
              <input
                id="lead-email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="email@exemplo.com"
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass} htmlFor="lead-city">Cidade</label>
              <input
                id="lead-city"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                placeholder="Cidade do lead"
                className={inputClass}
              />
            </div>

            {!fixedCampaign && (
              <div className="space-y-1">
                <label className={labelClass} htmlFor="lead-campaign">Campanha</label>
                <select
                  id="lead-campaign"
                  value={form.campaign_id}
                  onChange={(e) => setField('campaign_id', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem campanha</option>
                  {campaigns.map((c) => (
                    <option key={c.campaign_id} value={c.campaign_id}>
                      {c.campaign_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {consultants.length > 0 && (
              <div className="space-y-1 sm:col-span-2">
                <label className={labelClass} htmlFor="lead-consultant">Consultor responsável</label>
                <select
                  id="lead-consultant"
                  value={form.consultant_email}
                  onChange={(e) => setField('consultant_email', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem consultor</option>
                  {consultants.map((c) => (
                    <option key={c.id} value={c.email}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-8 px-3 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm rounded-md transition-colors duration-150 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium rounded-md transition-colors duration-150 inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin stroke-[1.5]" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5 stroke-[1.5]" />
                  <span>Cadastrar Lead</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
