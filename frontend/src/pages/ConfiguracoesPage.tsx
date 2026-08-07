import { useEffect, useState } from 'react'
import { Settings, Save, ShieldAlert, Key, Eye, EyeOff,
  MessageCircle
} from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { huggyService } from '../services/huggy'
import type { HuggyStatus, HuggyAgent, HuggyAgentRow } from '../services/huggy'

interface PermissionsData {
  roles: Record<string, string[]>
  users: Record<string, string[]>
}

interface User {
  id: string
  name: string
  email: string
  role: string
}

const AVAILABLE_PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'leads', label: 'Leads' },
  { id: 'agenda', label: 'Agenda do Dia' },
  { id: 'performance', label: 'Performance' },
  { id: 'negocios', label: 'Negócios' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'importar_leads', label: 'Importar Leads' },
  { id: 'configuracoes', label: 'Configurações' },
  { id: 'personalizacao', label: 'Personalização' },
  { id: 'distribuicao_leads', label: 'Distribuição de Leads' },
  { id: 'campanhas', label: 'Campanhas' },
]

const ROLES = [
  { id: 'master', label: 'Master' },
  { id: 'head', label: 'Head' },
  { id: 'administrativo', label: 'Administrativo' },
  { id: 'consultor', label: 'Consultor' },
]

export default function ConfiguracoesPage() {
  const [permissions, setPermissions] = useState<PermissionsData>({ roles: {}, users: {} })
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'roles' | 'users' | 'integrations'>('roles')
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)

  const { user: currentUser } = useAuthStore()
  const [openaiKey, setOpenaiKey] = useState('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [showKey, setShowKey] = useState(false)

  // Huggy
  const [huggyStatus, setHuggyStatus] = useState<HuggyStatus | null>(null)
  const [huggyClientId, setHuggyClientId] = useState('')
  const [huggyClientSecret, setHuggyClientSecret] = useState('')
  const [huggyCompanyId, setHuggyCompanyId] = useState('')
  const [huggyPanelUrl, setHuggyPanelUrl] = useState('')
  const [huggyEnabled, setHuggyEnabled] = useState(false)
  const [huggyBusy, setHuggyBusy] = useState(false)
  const [huggyMsg, setHuggyMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [huggyPastedToken, setHuggyPastedToken] = useState('')
  const [huggyPastedRefresh, setHuggyPastedRefresh] = useState('')

  // Agent mapping (consultor do CRM -> agente Huggy)
  const [huggyAgents, setHuggyAgents] = useState<HuggyAgent[]>([])
  const [huggyUserRows, setHuggyUserRows] = useState<HuggyAgentRow[]>([])
  // user_id -> huggy_agent_id ('' means unlinked). Kept separate from the loaded rows so the
  // table shows pending edits before they are saved.
  const [huggyMapDraft, setHuggyMapDraft] = useState<Record<number, string>>({})
  const [huggyAgentsOpen, setHuggyAgentsOpen] = useState(false)
  const [huggyAgentsLoading, setHuggyAgentsLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  // The OAuth callback redirects back here with ?huggy=ok|erro, since a full-page navigation is
  // the only way to complete the consent flow under this CSP.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get('huggy')
    if (!outcome) return
    if (outcome === 'ok') {
      setHuggyMsg({ text: 'Huggy conectada com sucesso.', type: 'success' })
    } else {
      const reason = params.get('motivo')
      const reasons: Record<string, string> = {
        state: 'validação de segurança falhou (state inválido).',
        expirado: 'o link de conexão expirou. Tente novamente.',
        troca: 'a Huggy recusou a troca do código. Confira client_id/secret e a redirect URI.',
        parametros: 'a Huggy não retornou os parâmetros esperados.',
      }
      setHuggyMsg({
        text: `Não foi possível conectar: ${reasons[reason || ''] || 'erro desconhecido.'}`,
        type: 'error',
      })
    }
    setActiveTab('integrations')
    window.history.replaceState({}, '', window.location.pathname)
    loadHuggyStatus()
  }, [])

  const loadHuggyStatus = async () => {
    try {
      const status = await huggyService.getStatus()
      setHuggyStatus(status)
      setHuggyClientId(status.client_id || '')
      setHuggyCompanyId(status.company_id || '')
      setHuggyPanelUrl(status.panel_chat_url || '')
      setHuggyEnabled(status.enabled)
    } catch (err) {
      console.error('Erro ao carregar status da Huggy:', err)
    }
  }

  /**
   * Writes the form to the backend. Kept free of busy/message side effects so the other
   * actions can persist first without their own feedback being overwritten.
   */
  const persistHuggyConfig = async () => {
    const status = await huggyService.updateConfig({
      client_id: huggyClientId,
      // Omitted when blank so the stored secret survives an edit of the other fields.
      ...(huggyClientSecret ? { client_secret: huggyClientSecret } : {}),
      company_id: huggyCompanyId,
      panel_chat_url: huggyPanelUrl,
      enabled: huggyEnabled,
    })
    setHuggyStatus(status)
    setHuggyClientSecret('')
    return status
  }

  const handleSaveHuggy = async () => {
    setHuggyBusy(true)
    setHuggyMsg(null)
    try {
      await persistHuggyConfig()
      setHuggyMsg({ text: 'Configuração da Huggy salva.', type: 'success' })
    } catch (err: any) {
      setHuggyMsg({
        text: err?.response?.data?.detail || 'Erro ao salvar a configuração da Huggy.',
        type: 'error',
      })
    } finally {
      setHuggyBusy(false)
    }
  }

  const handleConnectHuggy = async () => {
    setHuggyBusy(true)
    setHuggyMsg(null)
    try {
      // Save first so the backend has client_id/secret before generating the consent URL.
      await persistHuggyConfig()
      const { authorize_url } = await huggyService.oauthStart()
      window.location.href = authorize_url
    } catch (err: any) {
      setHuggyMsg({
        text: err?.response?.data?.detail || 'Erro ao iniciar a conexão com a Huggy.',
        type: 'error',
      })
      setHuggyBusy(false)
    }
  }

  const handlePasteHuggyToken = async () => {
    if (!huggyPastedToken.trim()) return
    setHuggyBusy(true)
    setHuggyMsg(null)
    try {
      const status = await huggyService.updateConfig({
        access_token: huggyPastedToken.trim(),
        ...(huggyPastedRefresh.trim() ? { refresh_token: huggyPastedRefresh.trim() } : {}),
      })
      setHuggyStatus(status)
      setHuggyEnabled(status.enabled)
      // Cleared immediately: the token should live only in the backend from here on.
      setHuggyPastedToken('')
      setHuggyPastedRefresh('')
      setHuggyMsg({
        text: 'Token aplicado. Use "Testar conexão" para confirmar que a Huggy aceita.',
        type: 'success',
      })
    } catch (err: any) {
      setHuggyMsg({
        text: err?.response?.data?.detail || 'Erro ao aplicar o token.',
        type: 'error',
      })
    } finally {
      setHuggyBusy(false)
    }
  }

  const handleTestHuggy = async () => {
    setHuggyBusy(true)
    setHuggyMsg(null)
    try {
      const result = await huggyService.test()
      setHuggyMsg({
        text: `Conexão OK${result.agent_name ? ` — autenticado como ${result.agent_name}` : ''}.`,
        type: 'success',
      })
      loadHuggyStatus()
    } catch (err: any) {
      setHuggyMsg({
        text: err?.response?.data?.detail || 'Não foi possível falar com a Huggy.',
        type: 'error',
      })
    } finally {
      setHuggyBusy(false)
    }
  }

  /** Hits the Huggy API, so it is loaded on demand rather than on every page open. */
  const loadHuggyAgents = async () => {
    setHuggyAgentsLoading(true)
    setHuggyMsg(null)
    try {
      const data = await huggyService.getAgents()
      setHuggyAgents(data.agents || [])
      setHuggyUserRows(data.users || [])
      // Seed the draft with what is already linked, falling back to the e-mail suggestion so a
      // matching agent is pre-selected but still requires an explicit save.
      const draft: Record<number, string> = {}
      for (const row of data.users || []) {
        draft[row.user_id] = row.huggy_agent_id || row.suggested_agent_id || ''
      }
      setHuggyMapDraft(draft)
      setHuggyAgentsOpen(true)
    } catch (err: any) {
      setHuggyMsg({
        text: err?.response?.data?.detail || 'Erro ao carregar os agentes da Huggy.',
        type: 'error',
      })
    } finally {
      setHuggyAgentsLoading(false)
    }
  }

  const handleSaveHuggyMappings = async () => {
    setHuggyBusy(true)
    setHuggyMsg(null)
    try {
      const mappings = huggyUserRows.map((row) => ({
        user_id: row.user_id,
        huggy_agent_id: huggyMapDraft[row.user_id] || null,
      }))
      const result = await huggyService.mapAgents(mappings)
      setHuggyMsg({
        text: `${result.updated} vínculo(s) salvo(s).`,
        type: 'success',
      })
      await loadHuggyStatus()
      await loadHuggyAgents()
    } catch (err: any) {
      setHuggyMsg({
        text: err?.response?.data?.detail || 'Erro ao salvar os vínculos.',
        type: 'error',
      })
    } finally {
      setHuggyBusy(false)
    }
  }

  const handleArmHuggyWebhook = async () => {
    setHuggyBusy(true)
    setHuggyMsg(null)
    try {
      // Persist whatever is typed in the form first: arming used to leave freshly entered
      // credentials in component state only, which read as "saved" but wasn't.
      await persistHuggyConfig()
      const { minutes } = await huggyService.armWebhook()
      const isLocal = /^(localhost|127\.0\.0\.1)/.test(window.location.host)
      setHuggyMsg({
        text: `Webhook armado por ${minutes} minutos. Salve esta URL em Configurações > Webhook ` +
              `na Huggy: ${window.location.origin}/api/huggy/webhook` +
              (isLocal
                ? ' — ATENÇÃO: este endereço é local e os servidores da Huggy não conseguem ' +
                  'alcançá-lo. Use um túnel público (ngrok/cloudflared) ou configure o webhook ' +
                  'apenas em produção.'
                : ''),
        type: isLocal ? 'error' : 'success',
      })
      loadHuggyStatus()
    } catch (err: any) {
      setHuggyMsg({
        text: err?.response?.data?.detail || 'Erro ao armar o webhook.',
        type: 'error',
      })
    } finally {
      setHuggyBusy(false)
    }
  }

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const isHeadOrMaster = currentUser?.role === 'master' || currentUser?.role === 'head'
      const promises: Promise<any>[] = [
        api.get('/settings/permissions'),
        api.get('/auth/users')
      ]
      if (isHeadOrMaster) {
        loadHuggyStatus()
        promises.push(api.get('/settings/openai-key'))
      }

      const results = await Promise.all(promises)
      setPermissions(results[0].data)
      setUsers(results[1].data)
      
      if (isHeadOrMaster && results[2]) {
        setOpenaiKey(results[2].data.api_key || '')
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
      await api.put('/settings/permissions', permissions)
      
      setMessage({ text: 'Configurações salvas com sucesso!', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save permissions:', err)
      setMessage({ text: 'Erro ao salvar configurações', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveOpenAIKey = async () => {
    setIsSavingKey(true)
    setMessage(null)
    try {
      await api.put('/settings/openai-key', { api_key: openaiKey })
      setMessage({ text: 'Chave OpenAI salva com sucesso!', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save OpenAI API Key:', err)
      setMessage({ text: 'Erro ao salvar chave OpenAI', type: 'error' })
    } finally {
      setIsSavingKey(false)
    }
  }

  const toggleRolePermission = (role: string, pageId: string) => {
    setPermissions(prev => {
      const currentRolePerms = prev.roles[role] || AVAILABLE_PAGES.map(p => p.id) // Default is all
      const newRolePerms = currentRolePerms.includes(pageId)
        ? currentRolePerms.filter(id => id !== pageId)
        : [...currentRolePerms, pageId]
      
      return { ...prev, roles: { ...prev.roles, [role]: newRolePerms } }
    })
  }

  const toggleUserPermission = (userId: string, pageId: string) => {
    setPermissions(prev => {
      // If user doesn't have custom perms, we assume they start with their role's perms
      const userObj = users.find(u => u.id === userId)
      const rolePerms = userObj && prev.roles[userObj.role] ? prev.roles[userObj.role] : AVAILABLE_PAGES.map(p => p.id)
      
      const currentUserPerms = prev.users[userId] || rolePerms
      const newUserPerms = currentUserPerms.includes(pageId)
        ? currentUserPerms.filter(id => id !== pageId)
        : [...currentUserPerms, pageId]
      
      return { ...prev, users: { ...prev.users, [userId]: newUserPerms } }
    })
  }

  const resetUserPermissions = (userId: string) => {
    setPermissions(prev => {
      const newUsers = { ...prev.users }
      delete newUsers[userId]
      return { ...prev, users: newUsers }
    })
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
            <Settings className="w-6 h-6 text-[var(--accent)]" />
            Configurações de Acesso
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Gerencie quem pode visualizar cada aba da plataforma, por nível de acesso (Role) ou especificamente por Usuário.
          </p>
        </div>
        {activeTab !== 'integrations' && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-md text-sm font-medium border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-sm">
        <div className="flex border-b border-[var(--border)]">
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium text-center transition-colors ${activeTab === 'roles' ? 'bg-[var(--background)] text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]'}`}
            onClick={() => setActiveTab('roles')}
          >
            Nível de Acesso (Roles)
          </button>
          <button
            className={`flex-1 py-3 px-4 text-sm font-medium text-center transition-colors ${activeTab === 'users' ? 'bg-[var(--background)] text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]'}`}
            onClick={() => setActiveTab('users')}
          >
            Acesso por Usuário
          </button>
          {(currentUser?.role === 'master' || currentUser?.role === 'head') && (
            <button
              className={`flex-1 py-3 px-4 text-sm font-medium text-center transition-colors ${activeTab === 'integrations' ? 'bg-[var(--background)] text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]'}`}
              onClick={() => setActiveTab('integrations')}
            >
              Integrações (API Keys)
            </button>
          )}
        </div>

        <div className="p-6">
          {activeTab === 'roles' && (
            <div className="space-y-8">
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 rounded-lg text-blue-700 dark:text-blue-400 text-sm">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <p>Configurações definidas aqui se aplicam a todos os usuários com o respectivo nível, a menos que uma exceção seja criada na aba "Acesso por Usuário".</p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-[var(--text-secondary)] uppercase bg-[var(--background)]">
                    <tr>
                      <th className="px-6 py-4 font-medium">Nível (Role)</th>
                      {AVAILABLE_PAGES.map(page => (
                        <th key={page.id} className="px-4 py-4 font-medium text-center">
                          {page.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                    {ROLES.map(role => {
                      const perms = permissions.roles[role.id] || AVAILABLE_PAGES.map(p => p.id)
                      return (
                        <tr key={role.id} className="hover:bg-[var(--background)] transition-colors">
                          <td className="px-6 py-4 font-medium whitespace-nowrap">
                            {role.label}
                          </td>
                          {AVAILABLE_PAGES.map(page => {
                            const hasAccess = perms.includes(page.id)
                            return (
                              <td key={page.id} className="px-4 py-4 text-center">
                                <label className="inline-flex items-center cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={hasAccess}
                                    onChange={() => toggleRolePermission(role.id, page.id)}
                                  />
                                  <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[var(--accent)]"></div>
                                </label>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-[var(--text-secondary)] uppercase bg-[var(--background)]">
                    <tr>
                      <th className="px-6 py-4 font-medium min-w-[200px]">Usuário</th>
                      {AVAILABLE_PAGES.map(page => (
                        <th key={page.id} className="px-4 py-4 font-medium text-center">
                          {page.label}
                        </th>
                      ))}
                      <th className="px-6 py-4 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                    {users.map(user => {
                      const isCustomized = !!permissions.users[user.id]
                      const basePerms = permissions.roles[user.role] || AVAILABLE_PAGES.map(p => p.id)
                      const userPerms = permissions.users[user.id] || basePerms

                      return (
                        <tr key={user.id} className={`hover:bg-[var(--background)] transition-colors ${isCustomized ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium">{user.name}</div>
                            <div className="text-xs text-[var(--text-secondary)]">{user.email} &middot; <span className="uppercase text-[10px] bg-[var(--background)] px-1 py-0.5 rounded border border-[var(--border)]">{user.role}</span></div>
                          </td>
                          {AVAILABLE_PAGES.map(page => {
                            const hasAccess = userPerms.includes(page.id)
                            return (
                              <td key={page.id} className="px-4 py-4 text-center">
                                <label className="inline-flex items-center cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={hasAccess}
                                    onChange={() => toggleUserPermission(user.id, page.id)}
                                  />
                                  <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-[var(--accent)]"></div>
                                </label>
                              </td>
                            )
                          })}
                          <td className="px-6 py-4 text-right">
                            {isCustomized ? (
                              <button 
                                onClick={() => resetUserPermissions(user.id)}
                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                              >
                                Restaurar Padrão
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--text-tertiary)] italic">Padrão da Role</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {activeTab === 'integrations' && (
            <div className="space-y-6 max-w-2xl">
              <div className="bg-[var(--surface-raised)] border border-[var(--border)] p-6 rounded-lg space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-[var(--accent)] rounded-lg">
                    <Key className="w-5 h-5 stroke-[1.5]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">OpenAI API Key</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Chave usada para gerar insights automáticos e resumos sobre as campanhas.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Chave de API OpenAI
                  </label>
                  <div className="relative flex rounded-md shadow-sm">
                    <input
                      type={showKey ? 'text' : 'password'}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 rounded-lg text-xs placeholder-[var(--text-tertiary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors pr-10"
                      placeholder="sk-proj-..."
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {showKey ? <EyeOff className="w-4 h-4 stroke-[1.5]" /> : <Eye className="w-4 h-4 stroke-[1.5]" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    Sua chave é armazenada com segurança no banco de dados local e usada exclusivamente para as requisições de insights.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveOpenAIKey}
                    disabled={isSavingKey}
                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isSavingKey ? 'Salvando...' : 'Salvar Chave OpenAI'}
                  </button>
                </div>
              </div>

              {/* Huggy */}
              <div className="bg-[var(--surface-raised)] border border-[var(--border)] p-6 rounded-lg space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#25D366]/10 text-[#128C7E] dark:text-[#25D366] rounded-lg">
                      <MessageCircle className="w-5 h-5 stroke-[1.5]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-[var(--text-primary)]">Huggy (Atendimento)</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Espelha as conversas de WhatsApp na linha do tempo do lead e permite abrir
                        o atendimento já atribuído ao consultor.
                      </p>
                    </div>
                  </div>
                  {huggyStatus && (
                    /* Three states on purpose: a stored token that Huggy rejects used to show
                       as "Conectado", which is exactly how a bad token went unnoticed. */
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      huggyStatus.verified
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : huggyStatus.has_token
                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                    }`}>
                      {huggyStatus.verified
                        ? 'Conectado'
                        : huggyStatus.has_token
                        ? 'Token não verificado'
                        : 'Não conectado'}
                    </span>
                  )}
                </div>

                {huggyMsg && (
                  <div className={`text-xs px-3 py-2 rounded-md border ${
                    huggyMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800'
                  }`}>
                    {huggyMsg.text}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      Client ID
                    </label>
                    <input
                      className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={huggyClientId}
                      onChange={(e) => setHuggyClientId(e.target.value)}
                      placeholder="client_id do app Huggy"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={huggyClientSecret}
                      onChange={(e) => setHuggyClientSecret(e.target.value)}
                      placeholder={huggyStatus?.client_secret_masked || 'client_secret'}
                    />
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      Deixe vazio para manter o secret já salvo.
                    </p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      URL da conversa no painel (opcional)
                    </label>
                    <input
                      className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={huggyPanelUrl}
                      onChange={(e) => setHuggyPanelUrl(e.target.value)}
                      placeholder="https://www.huggy.app/panel/chat/{chat_id}"
                    />
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      Abra uma conversa na Huggy, copie a URL e troque o id por
                      {' '}<code>{'{chat_id}'}</code>. Sem isso, o botão abre a caixa de entrada
                      em vez da conversa específica.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      Company ID (opcional)
                    </label>
                    <input
                      className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={huggyCompanyId}
                      onChange={(e) => setHuggyCompanyId(e.target.value)}
                      placeholder="apenas para conta multi-empresa"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      Integração
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] h-[34px]">
                      <input
                        type="checkbox"
                        checked={huggyEnabled}
                        onChange={(e) => setHuggyEnabled(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--accent)]"
                      />
                      <span>Habilitada (mostra as conversas no CRM)</span>
                    </label>
                  </div>
                </div>

                {huggyStatus && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-[11px]">
                    {[
                      { label: 'Token', value: huggyStatus.verified ? 'validado' : huggyStatus.has_token ? 'não validado' : 'ausente' },
                      { label: 'Expira em', value: huggyStatus.days_to_expiry != null ? `${huggyStatus.days_to_expiry} dias` : '—' },
                      { label: 'Webhook', value: huggyStatus.webhook_configured ? 'configurado' : 'pendente' },
                      { label: 'Agentes vinculados', value: `${huggyStatus.agents_mapped}/${huggyStatus.agents_total}` },
                      { label: 'Contatos sem lead', value: String(huggyStatus.unmatched_contacts) },
                    ].map((item) => (
                      <div key={item.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-2">
                        <div className="text-[var(--text-secondary)] uppercase tracking-wider">{item.label}</div>
                        <div className="text-[var(--text-primary)] font-semibold mt-0.5">{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Escape hatch for localhost: Huggy cannot reach a local callback, so the
                    browser-based "gerador rápido de token" is the only way to authenticate here. */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Colar token manualmente (gerador rápido de token)
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      className="flex-1 bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={huggyPastedToken}
                      onChange={(e) => setHuggyPastedToken(e.target.value)}
                      placeholder="access_token"
                    />
                    <input
                      type="password"
                      className="flex-1 bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      value={huggyPastedRefresh}
                      onChange={(e) => setHuggyPastedRefresh(e.target.value)}
                      placeholder="refresh_token (opcional)"
                    />
                    <button
                      onClick={handlePasteHuggyToken}
                      disabled={huggyBusy || !huggyPastedToken.trim()}
                      className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
                    >
                      Usar token
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    Gere em developers.huggy.io (Gerador rápido de token) e cole aqui. Útil para
                    testar em localhost, onde o callback do OAuth não é alcançável. Em produção,
                    prefira o botão "Conectar ao Huggy".
                  </p>
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    URL do webhook (cadastrar na Huggy)
                  </div>
                  <code className="block text-[11px] text-[var(--text-primary)] break-all select-all">
                    {window.location.origin}/api/huggy/webhook
                  </code>
                  {/^(localhost|127\.0\.0\.1)/.test(window.location.host) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Este endereço é local — os servidores da Huggy não conseguem alcançá-lo.
                      Para receber eventos de verdade, use um túnel público ou configure o webhook
                      no ambiente de produção.
                    </p>
                  )}
                </div>

                {/* Agent mapping. Without a link the chat is created but left unassigned, so the
                    Huggy queue decides who answers instead of the lead's own consultant. */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Vincular consultores a agentes Huggy
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        Sem vínculo, a conversa é criada mas fica na fila da Huggy em vez de ir
                        para o consultor do lead.
                      </p>
                    </div>
                    <button
                      onClick={loadHuggyAgents}
                      disabled={huggyAgentsLoading || !huggyStatus?.has_token}
                      title={!huggyStatus?.has_token ? 'Conecte a Huggy primeiro' : 'Busca os agentes na Huggy'}
                      className="shrink-0 h-8 px-3 bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] text-xs rounded-md transition-colors disabled:opacity-40"
                    >
                      {huggyAgentsLoading ? 'Carregando...' : huggyAgentsOpen ? 'Recarregar' : 'Carregar agentes'}
                    </button>
                  </div>

                  {huggyAgentsOpen && (
                    huggyUserRows.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-secondary)] py-2">
                        Nenhum usuário ativo no CRM para vincular.
                      </p>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]">
                                <th className="py-1.5 pr-3">Usuário do CRM</th>
                                <th className="py-1.5 px-2">Perfil</th>
                                <th className="py-1.5 pl-2">Agente na Huggy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {huggyUserRows.map((row) => {
                                const value = huggyMapDraft[row.user_id] ?? ''
                                const isSuggestion =
                                  !row.huggy_agent_id &&
                                  !!row.suggested_agent_id &&
                                  value === row.suggested_agent_id
                                return (
                                  <tr key={row.user_id} className="border-b border-[var(--border)] last:border-b-0">
                                    <td className="py-2 pr-3">
                                      <div className="text-[var(--text-primary)] font-medium truncate max-w-[180px]">
                                        {row.name}
                                      </div>
                                      <div className="text-[10px] text-[var(--text-secondary)] truncate max-w-[180px]">
                                        {row.email}
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-[var(--text-secondary)] capitalize">
                                      {row.role}
                                    </td>
                                    <td className="py-2 pl-2">
                                      <select
                                        value={value}
                                        onChange={(e) =>
                                          setHuggyMapDraft((prev) => ({
                                            ...prev,
                                            [row.user_id]: e.target.value,
                                          }))
                                        }
                                        className="w-full max-w-[280px] h-8 px-2 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                      >
                                        <option value="">— não vinculado —</option>
                                        {huggyAgents.map((agent) => (
                                          <option key={agent.id} value={agent.id}>
                                            {agent.name}{agent.email ? ` (${agent.email})` : ''}
                                          </option>
                                        ))}
                                      </select>
                                      {isSuggestion && (
                                        <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                                          sugerido pelo e-mail — confirme salvando
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-[var(--text-tertiary)]">
                            {huggyAgents.length} agente(s) na Huggy
                          </span>
                          <button
                            onClick={handleSaveHuggyMappings}
                            disabled={huggyBusy}
                            className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                          >
                            Salvar vínculos
                          </button>
                        </div>
                      </>
                    )
                  )}
                </div>

                {huggyStatus?.last_error && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Último erro: {huggyStatus.last_error}
                  </p>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    onClick={handleArmHuggyWebhook}
                    disabled={huggyBusy}
                    title="Abre uma janela de 15 min para a Huggy registrar o token do webhook"
                    className="bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface)] px-3 py-2 rounded-md text-sm transition-colors disabled:opacity-50"
                  >
                    Armar webhook
                  </button>
                  <button
                    onClick={handleTestHuggy}
                    disabled={huggyBusy}
                    className="bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface)] px-3 py-2 rounded-md text-sm transition-colors disabled:opacity-50"
                  >
                    Testar conexão
                  </button>
                  <button
                    onClick={handleSaveHuggy}
                    disabled={huggyBusy}
                    className="bg-transparent border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface)] px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Salvar
                  </button>
                  <button
                    onClick={handleConnectHuggy}
                    disabled={huggyBusy}
                    className="bg-[#25D366] hover:bg-[#1da851] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {huggyStatus?.has_token ? 'Reconectar' : 'Conectar ao Huggy'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
