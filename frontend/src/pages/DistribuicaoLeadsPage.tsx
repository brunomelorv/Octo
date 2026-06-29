import { useEffect, useState } from 'react'
import { Save, GitMerge } from 'lucide-react'
import api from '../services/api'

interface User {
  id: string
  name: string
  email: string
  role: string
}

export default function DistribuicaoLeadsPage() {
  const [users, setUsers] = useState<User[]>([])
  const [autoDistribute, setAutoDistribute] = useState(false)
  const [participatingUsers, setParticipatingUsers] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [usersRes, distRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/config/distribuicao')
      ])
      setUsers(usersRes.data)
      if (distRes.data) {
        setAutoDistribute(distRes.data.auto_distribute)
        setParticipatingUsers(distRes.data.participating_users || [])
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setMessage({ text: 'Erro ao carregar configurações', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      await api.put('/config/distribuicao', {
        auto_distribute: autoDistribute,
        participating_users: participatingUsers
      })
      setMessage({ text: 'Configurações salvas com sucesso!', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save config:', err)
      setMessage({ text: 'Erro ao salvar configurações', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-secondary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <GitMerge className="w-6 h-6 text-[var(--accent)]" />
            Distribuição de Leads
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Configure como os novos leads serão distribuídos entre os usuários da plataforma.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-md text-sm font-medium border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-sm p-6">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-[var(--background)] border border-[var(--border)] rounded-lg">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Distribuição Automática (Round-Robin)</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Ao ativar, os novos leads importados ou capturados serão distribuídos em formato de rodízio entre os usuários selecionados abaixo.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input type="checkbox" className="sr-only peer" checked={autoDistribute} onChange={(e) => setAutoDistribute(e.target.checked)} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[var(--accent)]"></div>
            </label>
          </div>

          {autoDistribute && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">Usuários na Fila de Distribuição</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {users.map(user => {
                  const isParticipating = participatingUsers.includes(user.id);
                  return (
                    <div key={user.id} className={`flex items-center p-4 border rounded-lg transition-colors cursor-pointer select-none ${isParticipating ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:bg-[var(--background)]'}`} onClick={() => {
                      if (isParticipating) {
                        setParticipatingUsers(prev => prev.filter(id => id !== user.id));
                      } else {
                        setParticipatingUsers(prev => [...prev, user.id]);
                      }
                    }}>
                      <input type="checkbox" checked={isParticipating} readOnly className="w-5 h-5 text-[var(--accent)] bg-[var(--surface)] border-[var(--border)] rounded focus:ring-[var(--accent)] focus:ring-2 mr-4 pointer-events-none" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{user.name}</p>
                        <p className="text-xs text-[var(--text-secondary)] uppercase mt-0.5">{user.role}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {participatingUsers.length === 0 && (
                <div className="p-4 border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-900/30 rounded-md text-sm text-yellow-700 dark:text-yellow-500">
                  Aviso: Nenhum usuário selecionado. A distribuição automática não funcionará sem participantes na fila.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
