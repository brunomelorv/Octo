import { useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

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
    <header className="h-16 px-6 border-b border-[var(--border)] bg-[var(--card-bg)] flex items-center justify-between transition-colors duration-200 select-none">
      <h1 className="text-xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
        {getPageTitle()}
      </h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--ice)] text-gray-600 dark:text-gray-300 border border-[var(--border)] rounded-full text-xs font-semibold shadow-sm transition-colors duration-200">
          <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Período: {getFormattedDate()}</span>
        </div>

        <button
          onClick={() => setIsDark(!isDark)}
          className="p-2 bg-[var(--ice)] text-gray-600 dark:text-gray-300 border border-[var(--border)] hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition duration-150 focus:outline-none"
          title={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
        >
          {isDark ? (
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 9h-1m15.364-3.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707m2.828 9.9a5 5 0 117.072 0l-7.072 7.072z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
