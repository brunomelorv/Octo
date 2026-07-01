import { useState, useRef } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { NavLink } from 'react-router-dom'
import {
  KeyRound,
  LogOut,
  ShieldAlert,
  X,
  LayoutDashboard,
  Users,
  Calendar,
  BarChart3,
  TrendingUp,
  UserCog,
  MoreHorizontal,
  Settings,
  Palette,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Camera,
  Upload
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useAuthStore } from '../../store/authStore'
import { authService } from '../../services/auth'

import { useConfigStore } from '../../store/configStore'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const config = useConfigStore((state) => state.config)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({ leads: true })

  const setAuth = useAuthStore((state) => state.setAuth)
  const token = useAuthStore((state) => state.token)
  const permissions = useAuthStore((state) => state.permissions)

  const [avatarOpen, setAvatarOpen] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      id: 'dashboard',
      icon: <LayoutDashboard className="h-4 w-4 stroke-[1.5]" />,
    },
    {
      name: 'Agenda do Dia',
      path: '/agenda',
      id: 'agenda',
      icon: <Calendar className="h-4 w-4 stroke-[1.5]" />,
    },
    {
      name: 'Leads',
      path: '/leads',
      id: 'leads',
      icon: <Users className="h-4 w-4 stroke-[1.5]" />,
      subItems: [
        {
          name: 'Importar Leads',
          path: '/importar-leads',
          id: 'importar_leads',
        },
        {
          name: 'Distribuição',
          path: '/distribuicao-leads',
          id: 'distribuicao_leads',
        },
      ]
    },
    {
      name: 'Campanhas',
      path: '/campanhas',
      id: 'campanhas',
      icon: <Megaphone className="h-4 w-4 stroke-[1.5]" />,
    },
    {
      name: 'Negócios',
      path: '/negocios',
      id: 'negocios',
      icon: <BarChart3 className="h-4 w-4 stroke-[1.5]" />,
    },
    {
      name: 'Performance',
      path: '/performance',
      id: 'performance',
      icon: <TrendingUp className="h-4 w-4 stroke-[1.5]" />,
    },
    {
      name: 'Usuarios',
      path: '/usuarios',
      id: 'usuarios',
      adminOnly: true,
      icon: <UserCog className="h-4 w-4 stroke-[1.5]" />,
    },
    {
      name: 'Configurações',
      path: '/configuracoes',
      id: 'configuracoes',
      icon: <Settings className="h-4 w-4 stroke-[1.5]" />,
    },
    {
      name: 'Personalização',
      path: '/personalizacao',
      id: 'personalizacao',
      icon: <Palette className="h-4 w-4 stroke-[1.5]" />,
    },
  ]

  const filterItem = (item: any) => {
    const pageId = item.id || item.path.replace('/', '').replace('-', '_')
    if (permissions && permissions.length > 0) {
      return permissions.includes(pageId)
    }
    
    // Fallback logic if permissions is empty (e.g. initial load before permissions are fetched)
    if (item.path === '/usuarios' || item.path === '/configuracoes' || item.path === '/personalizacao') {
      return ['master', 'head', 'administrativo'].includes(user?.role || '')
    }
    if (item.path === '/performance') {
      return ['master', 'head', 'consultor'].includes(user?.role || '')
    }
    if (item.path === '/importar-leads' || item.path === '/distribuicao-leads') {
      return ['master', 'head', 'administrativo'].includes(user?.role || '')
    }
    return true
  }

  const visibleNavItems = navItems.map(item => {
    if (!filterItem(item)) return null
    if (item.subItems) {
      const filteredSubItems = item.subItems.filter(filterItem)
      return { ...item, subItems: filteredSubItems }
    }
    return item
  }).filter(Boolean) as typeof navItems

  const closePasswordModal = () => {
    setPasswordOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
    setPasswordSuccess(null)
    setSavingPassword(false)
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (newPassword !== confirmPassword) {
      setPasswordError('A nova senha e a confirmação não conferem.')
      return
    }

    setSavingPassword(true)
    try {
      await authService.changePassword(currentPassword, newPassword)
      setPasswordSuccess('Senha atualizada com sucesso.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => closePasswordModal(), 900)
    } catch (err: any) {
      setPasswordError(err?.response?.data?.detail || 'Não foi possível alterar a senha.')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setAvatarError('A imagem deve ter no máximo 2MB.')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
        setAvatarError(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAvatarSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!avatarPreview) {
      setAvatarError('Por favor, selecione uma imagem de perfil.')
      return
    }
    setSavingAvatar(true)
    setAvatarError(null)
    try {
      await authService.updateAvatar(avatarPreview)
      if (user && token) {
        setAuth({ ...user, avatar_base64: avatarPreview }, token, permissions)
      }
      setAvatarOpen(false)
      setAvatarPreview(null)
    } catch (err: any) {
      setAvatarError('Não foi possível salvar a imagem.')
    } finally {
      setSavingAvatar(false)
    }
  }

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#111827] text-gray-400 flex flex-col h-full select-none border-r border-gray-800 transition-colors duration-150">
      {/* Brand logo */}
      <div className="h-12 px-4 flex items-center gap-2 border-b border-gray-800/60">
        {config.logo_base64 ? (
          <img src={config.logo_base64} alt="Logo" className="h-6 w-auto object-contain" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-white flex-shrink-0" />
        )}
        <span className="text-sm font-semibold tracking-tight text-white truncate">
          {config.system_name}
        </span>
      </div>

      {/* Nav menu links */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
        {visibleNavItems.map((item) => {
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = expandedMenus[item.id] !== false; // Default to true if undefined

          return (
            <div key={item.id} className="space-y-0.5">
              <NavLink
                to={item.path}
                onClick={() => {
                  if (hasSubItems) {
                    setExpandedMenus(prev => ({ ...prev, [item.id]: !isExpanded }))
                  }
                }}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'hover:bg-white/5 hover:text-gray-200 text-gray-400'
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.name}</span>
                </div>
                {hasSubItems && (
                  <div className="text-gray-500">
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </div>
                )}
              </NavLink>
              {hasSubItems && isExpanded && (
                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-800 pl-2 animate-in slide-in-from-top-1 fade-in duration-200">
                   {item.subItems!.map(sub => (
                     <NavLink
                       key={sub.id}
                       to={sub.path}
                       className={({ isActive }) =>
                         `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-150 ${
                           isActive
                             ? 'bg-white/10 text-white'
                             : 'hover:bg-white/5 hover:text-gray-200 text-gray-400'
                         }`
                       }
                     >
                       <span>{sub.name}</span>
                     </NavLink>
                   ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom Profile section */}
      <div className="p-3 border-t border-gray-800/60 relative">
        <div className="flex items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            {user?.avatar_base64 ? (
              <img src={user.avatar_base64} alt="Avatar" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-700 text-gray-200 flex items-center justify-center font-bold text-xs flex-shrink-0">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Carregando...'}</p>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors duration-150"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Menu Popover */}
        {menuOpen && (
          <div className="absolute bottom-12 right-3 left-3 bg-[#1f2937] border border-gray-700 rounded-md shadow-lg py-1 z-50 text-xs">
            <button
              onClick={() => {
                setPasswordOpen(true)
                setMenuOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-gray-300 hover:bg-white/5 hover:text-white text-left transition-colors duration-150"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Trocar senha
            </button>
            <button
              onClick={() => {
                setAvatarOpen(true)
                setMenuOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-gray-300 hover:bg-white/5 hover:text-white text-left transition-colors duration-150"
            >
              <Camera className="h-3.5 w-3.5" />
              Alterar foto de perfil
            </button>
            <button
              onClick={() => {
                logout()
                setMenuOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-red-400 hover:bg-white/5 hover:text-red-300 text-left transition-colors duration-150"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair da Conta
            </button>
          </div>
        )}
      </div>

      {passwordOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-xs" onClick={closePasswordModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Trocar senha</h3>
                  </div>
                </div>
                <button
                  onClick={closePasswordModal}
                  className="p-1 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150 text-[var(--text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handlePasswordSubmit} className="p-4 space-y-3">
                {passwordError && (
                  <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                    {passwordSuccess}
                  </div>
                )}

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Senha atual</span>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="mt-1 w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Nova senha</span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-1 w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Confirmar nova senha</span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-1 w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                </label>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closePasswordModal}
                    className="flex-1 h-8 px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] text-sm font-medium transition-colors duration-150 text-[var(--text-primary)] bg-transparent"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="flex-1 h-8 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium transition-colors duration-150 disabled:opacity-60"
                  >
                    {savingPassword ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {avatarOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setAvatarOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg overflow-hidden transition-colors duration-150 animate-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Alterar foto de perfil</h3>
                  </div>
                </div>
                <button
                  onClick={() => setAvatarOpen(false)}
                  className="p-1 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors duration-150 text-[var(--text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAvatarSubmit} className="p-4 space-y-4">
                {avatarError && (
                  <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    {avatarError}
                  </div>
                )}

                <div className="flex flex-col items-center justify-center gap-3">
                  <div 
                    className="relative w-24 h-24 rounded-full border-2 border-dashed border-[var(--border-strong)] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-colors bg-[var(--surface-raised)]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : user?.avatar_base64 ? (
                      <img src={user.avatar_base64} alt="Current" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-[var(--text-tertiary)]">
                        <Upload className="h-6 w-6 mb-1" />
                        <span className="text-[10px] font-medium">Escolher foto</span>
                      </div>
                    )}
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleAvatarChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <p className="text-[10px] text-[var(--text-tertiary)] text-center">
                    JPG, PNG ou GIF. Máx 2MB.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarOpen(false)
                      setAvatarPreview(null)
                    }}
                    className="flex-1 h-8 px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] text-sm font-medium transition-colors duration-150 text-[var(--text-primary)] bg-transparent"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingAvatar || (!avatarPreview && !user?.avatar_base64)}
                    className="flex-1 h-8 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium transition-colors duration-150 disabled:opacity-60"
                  >
                    {savingAvatar ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
