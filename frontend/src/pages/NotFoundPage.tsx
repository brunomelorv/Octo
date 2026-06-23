import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 bg-ice text-text">
      <h1 className="text-6xl font-bold text-accent mb-4">404</h1>
      <p className="text-xl mb-6">Página não encontrada</p>
      <Link to="/" className="text-accent hover:underline">Voltar para o Início</Link>
    </div>
  );
}
