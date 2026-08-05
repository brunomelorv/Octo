import { useEffect } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

export interface ToastState {
  message: string
  type: 'success' | 'error'
}

interface ToastProps {
  toast: ToastState | null
  onDismiss: () => void
  /** Auto-dismiss delay in ms. */
  duration?: number
}

export default function Toast({ toast, onDismiss, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [toast, duration, onDismiss])

  if (!toast) return null

  return (
    <div
      className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg border text-sm font-medium flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 ${
        toast.type === 'success'
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800'
          : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/90 dark:text-red-300 dark:border-red-800'
      }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
      ) : (
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
      )}
      <span className="max-w-xs">{toast.message}</span>
      <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100 bg-transparent">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
