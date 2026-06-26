import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-150">
      <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-2">404</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-4">Página não encontrada</p>
      <Link to="/" className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors">
        Voltar para o Início
      </Link>
    </div>
  )
}
