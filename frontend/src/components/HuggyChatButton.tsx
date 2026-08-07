import { useState } from 'react'
import { MessageCircle, Loader2 } from 'lucide-react'
import { huggyService } from '../services/huggy'
import Toast from './ui/Toast'
import type { ToastState } from './ui/Toast'

interface HuggyChatButtonProps {
  phone?: string
  /** Called after a chat is ensured, so the caller can refresh a mirrored conversation. */
  onOpened?: () => void
  /** Compact rendering for tighter surfaces such as the agenda list. */
  compact?: boolean
}

/**
 * Ensures a Huggy contact + open chat for this phone, assigns it to the caller's mapped agent,
 * and opens Huggy.
 *
 * This is a write action against the company's real Huggy account — it creates a contact and
 * opens a service conversation — so it deliberately lives only where the click is intentional
 * (the lead drawer), never inside dashboard tables where a stray click would start a real
 * conversation.
 */
export default function HuggyChatButton({ phone, onOpened, compact = false }: HuggyChatButtonProps) {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  if (!phone) return null

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await huggyService.openChat(phone)

      if (!result.agent_mapped) {
        setToast({
          message:
            'Conversa pronta, mas seu usuário não está vinculado a um agente Huggy — ela ficou na fila.',
          type: 'error',
        })
      } else if (!result.assigned) {
        setToast({
          message: 'Conversa criada na Huggy, mas não foi possível atribuí-la a você.',
          type: 'error',
        })
      } else {
        setToast({ message: 'Conversa pronta na Huggy e atribuída a você.', type: 'success' })
      }

      // The backend returns the URL it knows how to build; it falls back to the inbox when the
      // per-chat URL template has not been configured.
      if (result.deep_link) {
        window.open(result.deep_link, '_blank', 'noopener,noreferrer')
      }
      onOpened?.()
    } catch (err: any) {
      setToast({
        message: err?.response?.data?.detail || 'Erro ao abrir a conversa na Huggy.',
        type: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={busy}
        title="Cria ou reaproveita a conversa na Huggy e atribui a você"
        className={`bg-[#25D366] hover:bg-[#1da851] text-white font-medium rounded-md transition-colors duration-150 inline-flex items-center justify-center gap-1.5 disabled:opacity-60 ${
          compact ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs'
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin stroke-[1.5]" />
            <span>Abrindo...</span>
          </>
        ) : (
          <>
            <MessageCircle className="h-3.5 w-3.5 stroke-[1.5]" />
            <span>Conversar no Huggy</span>
          </>
        )}
      </button>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}
