import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCog, Plus, Pencil, Trash2, X, ShieldCheck, User, RefreshCw } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { usuariosService } from '../services/usuarios'
import type { Usuario, CreateUsuarioPayload, UpdateUsuarioPayload, UserRole } from '../services/usuarios'

type ModalMode = 'create' | 'edit'

export default function UsuariosPage() {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editing, setEditing] = useState<Usuario | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('consultor')
  const [active, setActive] = useState(true)
  const [mustChange, setMustChange] = useState(true)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!['master', 'head', 'administrativo'].includes(currentUser?.role || '')) {
      navigate('/dashboard', { replace: true })
      return
    }
    fetchUsuarios()
  }, [currentUser])

  async function fetchUsuarios() {
    setLoading(true)
    setError(null)
    try {
      const data = await usuariosService.list()
      setUsuarios(data)
    } catch {
      setError('Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setModalMode('create')
    setEditing(null)
    setName('')
    setEmail('')
    setPassword('')
    setRole('consultor')
    setActive(true)
    setMustChange(true)
    setModalError(null)
    setModalOpen(true)
  }

  function openEdit(u: Usuario) {
    setModalMode('edit')
    setEditing(u)
    setName(u.name)
    setEmail(u.email)
    setPassword('')
    setRole(u.role)
    setActive(u.active)
    setMustChange(u.must_change_password)
    setModalError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setModalError(null)
    setSaving(true)
    try {
      if (modalMode === 'create') {
        const payload: CreateUsuarioPayload = { name, email, password, role }
        const created = await usuariosService.create(payload)
        setUsuarios((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      } else if (editing) {
        const payload: UpdateUsuarioPayload = { name, email, role, active, must_change_password: mustChange }
        if (password) payload.password = password
        const updated = await usuariosService.update(editing.id, payload)
        setUsuarios((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      }
      closeModal()
    } catch (err: any) {
      setModalError(err?.response?.data?.detail || 'Erro ao salvar usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await usuariosService.remove(deleteTarget.id)
      setUsuarios((prev) => prev.filter((u) => u.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err: any) {
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-[var(--text-secondary)]" />
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">Usuários</h1>
          {!loading && (
            <span className="ml-1 text-xs text-[var(--text-secondary)] font-normal">
              ({usuarios.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsuarios}
            className="h-7 w-7 flex items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-medium transition-colors duration-150"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo usuário
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-[var(--text-secondary)]">
            Carregando...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-40 text-sm text-red-500">{error}</div>
        ) : usuarios.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-[var(--text-secondary)]">
            Nenhum usuário cadastrado.
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">E-mail</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Perfil</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--surface-raised)] transition-colors duration-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.avatar_base64 ? (
                          <img src={u.avatar_base64} alt={u.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-[var(--text-secondary)] flex-shrink-0">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-[var(--text-primary)]">{u.name}</span>
                        {u.id === currentUser?.id && (
                          <span className="text-xs text-[var(--text-secondary)] italic">(você)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role === 'master' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200/50 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/30">
                          <ShieldCheck className="h-3 w-3" />
                          Master
                        </span>
                      )}
                      {u.role === 'head' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/50 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30">
                          <UserCog className="h-3 w-3" />
                          Head de BU
                        </span>
                      )}
                      {u.role === 'administrativo' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200/50 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30">
                          <User className="h-3 w-3" />
                          Administrativo
                        </span>
                      )}
                      {u.role === 'consultor' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/50 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/30">
                          <User className="h-3 w-3" />
                          Consultor
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-[var(--text-secondary)] hover:text-red-500 transition-colors duration-150"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={closeModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                  {modalMode === 'create' ? 'Novo usuário' : 'Editar usuário'}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-1 rounded border border-[var(--border)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors duration-150"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-3">
                {modalError && (
                  <div className="rounded border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    {modalError}
                  </div>
                )}

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Nome</span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">E-mail</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {modalMode === 'create' ? 'Senha' : 'Nova senha (deixe em branco para manter)'}
                  </span>
                  <input
                    type="password"
                    required={modalMode === 'create'}
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={modalMode === 'edit' ? '••••••' : ''}
                    className="mt-1 w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Perfil</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="mt-1 w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
                  >
                    <option value="master">Master</option>
                    <option value="head">Head de BU</option>
                    <option value="administrativo">Administrativo</option>
                    <option value="consultor">Consultor</option>
                  </select>
                </label>

                {modalMode === 'edit' && (
                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                        className="rounded border-[var(--border)] accent-[var(--accent)]"
                      />
                      <span className="text-xs text-[var(--text-secondary)]">Conta ativa</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mustChange}
                        onChange={(e) => setMustChange(e.target.checked)}
                        className="rounded border-[var(--border)] accent-[var(--accent)]"
                      />
                      <span className="text-xs text-[var(--text-secondary)]">Forçar troca de senha</span>
                    </label>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 h-8 px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] transition-colors duration-150"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 h-8 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-sm font-medium transition-colors duration-150 disabled:opacity-60"
                  >
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                  Confirmar exclusão
                </h2>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="p-1 rounded border border-[var(--border)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors duration-150"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4">
                <p className="text-sm text-[var(--text-primary)]">
                  Tem certeza que deseja excluir o usuário{' '}
                  <span className="font-semibold">{deleteTarget.name}</span>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 h-8 px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] transition-colors duration-150"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 h-8 px-3 rounded-md bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors duration-150 disabled:opacity-60"
                  >
                    {deleting ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
