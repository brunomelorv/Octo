import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'

interface ConfirmDeleteModalProps {
  open: boolean
  /** Number of leads about to be deleted — drives the copy. */
  count: number
  /** Shown when deleting a single named lead. */
  leadName?: string | null
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDeleteModal({
  open,
  count,
  leadName,
  deleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!open) return null

  const target =
    count === 1 && leadName ? `o lead "${leadName}"` : `${count} lead(s) selecionado(s)`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={deleting ? undefined : onCancel} />

      <div className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Confirmar exclusão</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 bg-transparent"
          >
            <X className="h-4 w-4 stroke-[1.5]" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-2">
          <p className="text-sm text-[var(--text-primary)]">
            Tem certeza que deseja excluir {target}?
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Esta ação é permanente. O histórico de negócio vinculado também será removido. As
            chamadas registradas não são apagadas.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-8 px-3 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-sm rounded-md transition-colors duration-150 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="h-8 px-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors duration-150 inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {deleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin stroke-[1.5]" />
                <span>Excluindo...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>Excluir</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
