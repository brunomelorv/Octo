import { useEffect, useState } from 'react'
import { Settings, Save, ShieldAlert } from 'lucide-react'
import api from '../services/api'

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
  { id: 'performance', label: 'Performance' },
  { id: 'negocios', label: 'Negócios' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'importar_leads', label: 'Importar Leads' },
  { id: 'configuracoes', label: 'Configurações' },
  { id: 'personalizacao', label: 'Personalização' },
  { id: 'distribuicao_leads', label: 'Distribuição de Leads' },
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
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles')
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)


  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [permRes, usersRes] = await Promise.all([
        api.get('/config/permissions'),
        api.get('/auth/users')
      ])
      setPermissions(permRes.data)
      setUsers(usersRes.data)
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
      await api.put('/config/permissions', permissions)
      
      setMessage({ text: 'Configurações salvas com sucesso!', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save permissions:', err)
      setMessage({ text: 'Erro ao salvar configurações', type: 'error' })
    } finally {
      setIsSaving(false)
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
        </div>
      </div>
    </div>
  )
}
