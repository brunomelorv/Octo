import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { useAuthStore } from '../store/authStore'
import { useConfigStore } from '../store/configStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const setAuth = useAuthStore((state) => state.setAuth)
  const config = useConfigStore((state) => state.config)
  const navigate = useNavigate()

  useEffect(() => {
    document.title = `${config.system_name} - Login`
  }, [config.system_name])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const data = await authService.login(email, password)
      localStorage.setItem('token', data.access_token)
      
      const [user, permissions] = await Promise.all([
        authService.getMe(),
        authService.getMyPermissions().catch(() => [])
      ])
      
      setAuth(user, data.access_token, permissions)
      navigate('/dashboard')
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError('E-mail ou senha incorretos.')
      }
      localStorage.removeItem('token')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4 transition-colors duration-150">
      {/* Top logo */}
      <div className="flex items-center gap-2 mb-6 select-none">
        {config.logo_base64 ? (
          <img src={config.logo_base64} alt="Logo" className="h-8 object-contain" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] flex-shrink-0" />
        )}
        {!config.logo_base64 && (
          <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {config.system_name}
          </span>
        )}
      </div>

      {/* Main card */}
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 transition-colors duration-150">
        <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)] mb-1">Entrar na plataforma</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-4">Insira suas credenciais de acesso abaixo</p>

        {error && (
          <div className="mb-4 p-2 border border-red-200 dark:border-red-950/20 bg-red-50 dark:bg-red-950/10 rounded-md text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] mb-1.5" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@empresa.com"
              className="w-full h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] mb-1.5" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-8 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors duration-150"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-8 mt-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded-md text-sm font-medium transition-colors duration-150 disabled:opacity-60 flex justify-center items-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-[var(--accent-fg)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>
      </div>

      <div className="mt-6 text-center text-xs text-[var(--text-tertiary)]">
        &copy; {new Date().getFullYear()} {config.system_name}. Todos os direitos reservados.
      </div>
    </div>
  )
}
