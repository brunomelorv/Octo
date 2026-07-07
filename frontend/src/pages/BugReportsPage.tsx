import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import {
  Bug,
  Terminal,
  CheckCircle,
  Trash2,
  Plus,
  RefreshCw,
  Copy,
  AlertCircle
} from 'lucide-react'

interface BugReport {
  id: number
  user_id: number
  username: string
  title: string
  description: string
  logs: string
  status: string
  created_at: string
}

export default function BugReportsPage() {
  const { user, token } = useAuthStore()

  // Guard route - wait if user session is restoring
  if (token && !user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
      </div>
    )
  }

  if (user?.role !== 'master') {
    return <Navigate to="/dashboard" replace />
  }

  const [reports, setReports] = useState<BugReport[]>([])
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // System logs state
  const [systemLogs, setSystemLogs] = useState<string[]>([])
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Create report form state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [includeLogs, setIncludeLogs] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const fetchReports = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/bug-reports/')
      setReports(response.data)
      if (response.data.length > 0 && !selectedReport) {
        setSelectedReport(response.data[0])
      }
    } catch (err: any) {
      console.error(err)
      setError('Erro ao carregar reportes de erro.')
    } finally {
      setLoading(false)
    }
  }

  const fetchSystemLogs = async () => {
    setLoadingLogs(true)
    try {
      const response = await api.get('/bug-reports/system-logs')
      setSystemLogs(response.data.logs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleResolve = async (id: number) => {
    try {
      await api.put(`/bug-reports/${id}/resolve`)
      setReports(prev =>
        prev.map(r => (r.id === id ? { ...r, status: 'resolved' } : r))
      )
      if (selectedReport?.id === id) {
        setSelectedReport(prev => prev ? { ...prev, status: 'resolved' } : null)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao marcar reporte como resolvido.')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente excluir este reporte de erro?')) return
    try {
      await api.delete(`/bug-reports/${id}`)
      const filtered = reports.filter(r => r.id !== id)
      setReports(filtered)
      if (selectedReport?.id === id) {
        setSelectedReport(filtered.length > 0 ? filtered[0] : null)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao deletar reporte de erro.')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newDescription.trim()) return
    setSubmitting(true)
    try {
      const response = await api.post('/bug-reports/', {
        title: newTitle,
        description: newDescription,
        include_logs: includeLogs
      })
      setReports(prev => [response.data, ...prev])
      setSelectedReport(response.data)
      setShowCreateModal(false)
      setNewTitle('')
      setNewDescription('')
    } catch (err) {
      console.error(err)
      alert('Erro ao enviar reporte de erro.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyLogs = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Logs copiados para a área de transferência!')
  }

  useEffect(() => {
    fetchReports()
  }, [])

  return (
    <div className="space-y-4 max-w-6xl mx-auto p-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Bug className="w-5 h-5 text-red-500 stroke-[1.5]" />
            Reportes de Erro & Logs do Sistema
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Área exclusiva do Administrador Master para monitoramento de problemas e análise técnica.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              fetchSystemLogs()
              setShowLogsModal(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] hover:bg-[var(--surface-raised)] rounded-lg text-xs font-semibold transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Terminal className="w-3.5 h-3.5" />
            Visualizar Logs Ativos
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Reportar Novo Erro
          </button>
          <button
            onClick={fetchReports}
            className="p-1.5 border border-[var(--border)] hover:bg-[var(--surface-raised)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg text-red-700 dark:text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sidebar list of reports */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden flex flex-col max-h-[70vh] md:col-span-1">
          <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
              Histórico de Reportes ({reports.length})
            </span>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-[var(--border)]">
            {loading && reports.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-secondary)]">Carregando reportes...</div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-secondary)]">Nenhum erro reportado ainda.</div>
            ) : (
              reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReport(r)}
                  className={`w-full text-left p-3 transition-colors text-xs space-y-1 block ${
                    selectedReport?.id === r.id
                      ? 'bg-[var(--surface-raised)] border-l-2 border-[var(--accent)]'
                      : 'hover:bg-[var(--surface-raised)] border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-semibold text-[var(--text-primary)] truncate block">{r.title}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                        r.status === 'resolved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400'
                          : 'bg-red-50 text-red-700 border border-red-250 dark:bg-red-950/20 dark:text-red-400'
                      }`}
                    >
                      {r.status === 'resolved' ? 'Resolvido' : 'Pendente'}
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)] line-clamp-1">{r.description}</p>
                  <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] pt-1">
                    <span>@{r.username}</span>
                    <span>{r.created_at}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detailed View */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden flex flex-col md:col-span-2 min-h-[50vh]">
          {selectedReport ? (
            <div className="flex flex-col flex-1">
              {/* Header Details */}
              <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">{selectedReport.title}</h2>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                        selectedReport.status === 'resolved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400'
                          : 'bg-red-50 text-red-700 border border-red-250 dark:bg-red-950/20 dark:text-red-400'
                      }`}
                    >
                      {selectedReport.status === 'resolved' ? 'Resolvido' : 'Pendente'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-[10px] text-[var(--text-secondary)] mt-1">
                    <span>Reportado por: <strong>@{selectedReport.username}</strong></span>
                    <span>Data: <strong>{selectedReport.created_at}</strong></span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {selectedReport.status !== 'resolved' && (
                    <button
                      onClick={() => handleResolve(selectedReport.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-750 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/25 border border-emerald-250 dark:border-emerald-900/30 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Marcar Resolvido
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(selectedReport.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-750 dark:bg-red-950/15 dark:hover:bg-red-950/25 border border-red-250 dark:border-red-900/30 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                </div>
              </div>

              {/* Body Details */}
              <div className="p-4 flex-1 space-y-4 overflow-y-auto">
                <div className="space-y-1">
                  <h3 className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
                    Descrição do Problema
                  </h3>
                  <p className="text-xs text-[var(--text-primary)] bg-[var(--surface-raised)] p-3 rounded-lg border border-[var(--border)] whitespace-pre-wrap leading-relaxed">
                    {selectedReport.description}
                  </p>
                </div>

                {selectedReport.logs ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider flex items-center gap-1">
                        <Terminal className="w-3.5 h-3.5 text-blue-500" />
                        Logs do Sistema Anexados
                      </h3>
                      <button
                        onClick={() => handleCopyLogs(selectedReport.logs)}
                        className="flex items-center gap-1 px-2 py-1 border border-[var(--border)] hover:bg-[var(--surface-raised)] rounded text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Copiar Logs
                      </button>
                    </div>
                    <pre className="text-[10px] font-mono text-zinc-300 bg-zinc-950 p-4 rounded-lg overflow-x-auto max-h-[30vh] border border-zinc-800 leading-normal">
                      {selectedReport.logs}
                    </pre>
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--text-tertiary)] italic p-3 bg-[var(--surface-raised)] border border-dashed border-[var(--border)] rounded-lg">
                    Nenhum log do sistema foi anexado a este reporte de erro.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8 text-[var(--text-secondary)]">
              <AlertCircle className="w-8 h-8 text-[var(--text-tertiary)] stroke-[1] mb-2" />
              <p className="text-xs font-semibold">Nenhum reporte selecionado</p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                Selecione um item no histórico ao lado ou crie um novo reporte.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Live Logs */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-blue-500" />
                  Terminal de Logs Ativos
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Mostrando as últimas 100 linhas registradas no buffer de memória da API.
                </p>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1.5 rounded-lg hover:bg-[var(--surface-raised)]"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-zinc-950 flex-1 overflow-y-auto min-h-[40vh]">
              {loadingLogs ? (
                <div className="text-xs text-zinc-400 text-center py-12">Carregando terminal de logs...</div>
              ) : systemLogs.length === 0 ? (
                <div className="text-xs text-zinc-500 italic text-center py-12">Nenhum registro de log no momento.</div>
              ) : (
                <pre className="text-[10px] font-mono text-zinc-350 leading-relaxed whitespace-pre-wrap">
                  {systemLogs.join('\n')}
                </pre>
              )}
            </div>
            <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-raised)] flex justify-end gap-2">
              <button
                onClick={fetchSystemLogs}
                className="px-3 py-1.5 border border-[var(--border)] hover:bg-[var(--surface)] rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="w-3 h-3" />
                Atualizar Terminal
              </button>
              <button
                onClick={() => handleCopyLogs(systemLogs.join('\n'))}
                className="px-3 py-1.5 border border-[var(--border)] hover:bg-[var(--surface)] rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Copy className="w-3 h-3" />
                Copiar Todos
              </button>
              <button
                onClick={() => setShowLogsModal(false)}
                className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded-lg text-xs font-semibold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Report */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Bug className="w-4 h-4 text-red-500" />
                  Reportar Erro no Sistema
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Descreva o problema encontrado para arquivar uma investigação técnica.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1.5 rounded-lg hover:bg-[var(--surface-raised)]"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="p-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">Título do Erro</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Erro ao gerar insights de campanha ou falha de login"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border)] text-xs p-2.5 rounded-lg focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">Descrição Detalhada</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Descreva o que aconteceu, quais botões clicou ou qual mensagem de erro apareceu na tela..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border)] text-xs p-2.5 rounded-lg focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="include-logs"
                    checked={includeLogs}
                    onChange={(e) => setIncludeLogs(e.target.checked)}
                    className="rounded text-[var(--accent)] border-[var(--border)] focus:ring-[var(--accent)]"
                  />
                  <label htmlFor="include-logs" className="text-xs font-medium text-[var(--text-secondary)] cursor-pointer select-none">
                    Anexar automaticamente os últimos logs do sistema (100 linhas)
                  </label>
                </div>
              </div>
              <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-raised)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 border border-[var(--border)] hover:bg-[var(--surface)] rounded-lg text-xs font-semibold transition-colors text-[var(--text-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Enviando...' : 'Enviar Reporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
