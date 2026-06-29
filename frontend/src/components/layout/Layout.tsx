import { useRef, useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { Outlet } from 'react-router-dom'
import { ShieldAlert, KeyRound, Camera, Upload } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuthStore } from '../../store/authStore'
import { authService } from '../../services/auth'

export default function Layout() {
  const user = useAuthStore((state) => state.user)
  const setAuth = useAuthStore((state) => state.setAuth)
  const token = useAuthStore((state) => state.token)
  const permissions = useAuthStore((state) => state.permissions)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mustChange = user?.must_change_password
  const mustUploadAvatar = !mustChange && !user?.avatar_base64

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('A imagem deve ter no máximo 2MB.')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
        setError(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAvatarSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!avatarPreview) {
      setError('Por favor, selecione uma imagem de perfil.')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      await authService.updateAvatar(avatarPreview)
      if (user && token) {
        setAuth({ ...user, avatar_base64: avatarPreview }, token, permissions)
      }
    } catch (err: any) {
      setError('Não foi possível salvar a imagem.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (newPassword !== confirmPassword) {
      setError('A nova senha e a confirmação não conferem.')
      return
    }
    
    setIsLoading(true)
    try {
      await authService.changePassword(currentPassword, newPassword)
      // Update local state to remove the block
      if (user && token) {
        setAuth({ ...user, must_change_password: false }, token, permissions)
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Não foi possível alterar a senha.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-150">
      {mustChange && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="p-5 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--surface-raised)]">
               <ShieldAlert className="h-6 w-6 text-yellow-500" />
               <div>
                 <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-primary)]">Atualização Obrigatória</h3>
                 <p className="text-xs text-[var(--text-secondary)] mt-0.5">Defina uma nova senha para acessar o sistema.</p>
               </div>
             </div>
             
             <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 border border-red-200 dark:border-red-950/30 bg-red-50 dark:bg-red-900/10 rounded-md text-xs text-red-600 dark:text-red-400 font-medium">
                    {error}
                  </div>
                )}
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                      Senha Atual (Fornecida)
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Sua senha atual"
                      className="w-full h-9 px-3 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                      Nova Senha Segura
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      className="w-full h-9 px-3 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                      Confirmar Nova Senha
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full h-9 px-3 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 mt-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded-md text-sm font-medium transition-colors disabled:opacity-60 flex justify-center items-center gap-2"
                >
                  {isLoading ? (
                    <span className="animate-pulse">Salvando...</span>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      Salvar Senha e Acessar
                    </>
                  )}
                </button>
             </form>
          </div>
        </div>
      )}

      {mustUploadAvatar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="p-5 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--surface-raised)]">
               <Camera className="h-6 w-6 text-blue-500" />
               <div>
                 <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-primary)]">Foto de Perfil</h3>
                 <p className="text-xs text-[var(--text-secondary)] mt-0.5">Adicione uma foto para continuar.</p>
               </div>
             </div>
             
             <form onSubmit={handleAvatarSubmit} className="p-6 space-y-6">
                {error && (
                  <div className="p-3 border border-red-200 dark:border-red-950/30 bg-red-50 dark:bg-red-900/10 rounded-md text-xs text-red-600 dark:text-red-400 font-medium">
                    {error}
                  </div>
                )}
                
                <div className="flex flex-col items-center justify-center gap-4">
                  <div 
                    className="relative w-32 h-32 rounded-full border-2 border-dashed border-[var(--border-strong)] flex items-center justify-center overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-colors bg-[var(--surface-raised)]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-[var(--text-tertiary)]">
                        <Upload className="h-8 w-8 mb-2" />
                        <span className="text-xs font-medium">Escolher foto</span>
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
                  <p className="text-xs text-[var(--text-tertiary)] text-center">
                    Formatos suportados: JPG, PNG, GIF.<br/>Tamanho máximo: 2MB.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !avatarPreview}
                  className="w-full h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded-md text-sm font-medium transition-colors disabled:opacity-60 flex justify-center items-center gap-2"
                >
                  {isLoading ? (
                    <span className="animate-pulse">Salvando...</span>
                  ) : (
                    'Salvar Foto e Acessar'
                  )}
                </button>
             </form>
          </div>
        </div>
      )}

      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Horizontal topbar */}
        <Header />

        {/* Dynamic page container */}
        <main className="flex-grow p-6 overflow-x-hidden overflow-y-auto bg-[var(--background)] transition-colors duration-150">
          <div className="max-w-[1400px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
