import { useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function Header() {
  const location = useLocation()

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard':
        return 'Marketing Geral'
      case '/leads':
        return 'Controle de Leads'
      case '/campanhas':
        return 'Campanhas de Marketing'
      case '/negocios':
        return 'Funil de Negócios'
      default:
        return 'Dashboard'
    }
  }

  const [isDark, setIsDark] = useState(() => {
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  })

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  const getFormattedDate = () => {
    return new Date().toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <header className="h-12 px-4 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between transition-colors duration-150 select-none">
      <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
        {getPageTitle()}
      </h1>

      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-secondary)]">
          {getFormattedDate()}
        </span>

        <button
          onClick={() => setIsDark(!isDark)}
          className="p-1.5 hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors duration-150 focus:outline-none"
          title={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
        >
          {isDark ? (
            <Sun className="h-4 w-4 stroke-[1.5]" />
          ) : (
            <Moon className="h-4 w-4 stroke-[1.5]" />
          )}
        </button>
      </div>
    </header>
  )
}
