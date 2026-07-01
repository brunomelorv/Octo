import React, { useEffect, useState } from 'react'
import { Palette, Save, Type, Image as ImageIcon } from 'lucide-react'
import api from '../services/api'

export default function PersonalizacaoPage() {
  const [systemName, setSystemName] = useState('Portal do Frank')
  const [primaryColor, setPrimaryColor] = useState('')
  const [logoBase64, setLogoBase64] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/settings/personalizacao')
      if (res.data) {
        setSystemName(res.data.system_name || 'Portal do Frank')
        setPrimaryColor(res.data.primary_color || '')
        setLogoBase64(res.data.logo_base64 || '')
      }
    } catch (err) {
      console.error('Failed to fetch config:', err)
      setMessage({ text: 'Erro ao carregar configurações', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      await api.put('/settings/personalizacao', {
        system_name: systemName,
        primary_color: primaryColor,
        logo_base64: logoBase64
      })
      window.location.reload()
      setMessage({ text: 'Configurações salvas com sucesso!', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save config:', err)
      setMessage({ text: 'Erro ao salvar configurações', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 1024 * 1024 * 2) {
        setMessage({ text: 'A imagem deve ter no máximo 2MB', type: 'error' })
        setTimeout(() => setMessage(null), 3000)
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoBase64(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-secondary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Palette className="w-6 h-6 text-[var(--accent)]" />
            Personalização Visual
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Adapte as cores e os logos do sistema para a identidade visual da sua marca.
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

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-sm p-6">
        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <Type className="w-4 h-4 text-[var(--text-secondary)]" />
              Nome do Sistema
            </label>
            <input
              type="text"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              placeholder="Portal do Frank"
              className="w-full md:w-1/2 px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <p className="text-xs text-[var(--text-secondary)]">Será exibido na aba do navegador e nos menus caso não haja logo.</p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <Palette className="w-4 h-4 text-[var(--text-secondary)]" />
              Cor Principal (Hexadecimal)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={primaryColor || '#2563eb'}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-12 h-12 p-1 bg-[var(--background)] border border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--accent)] transition-colors"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#2563eb"
                className="w-32 px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] uppercase transition-colors"
              />
              <button 
                onClick={() => setPrimaryColor('')}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline ml-2 transition-colors"
              >
                Restaurar Padrão
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Cor usada nos botões, links e menus ativos.</p>
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-8">
            <label className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[var(--text-secondary)]" />
              Logo do Sistema
            </label>
            <div className="flex flex-col md:flex-row items-start gap-8">
              <div className="w-full md:flex-1">
                <label className="block border-2 border-dashed border-[var(--border)] bg-[var(--background)] rounded-xl p-8 text-center hover:border-[var(--accent)] hover:bg-[var(--surface)] transition-all cursor-pointer relative group">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  />
                  <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors">
                    <ImageIcon className="w-10 h-10" />
                    <div>
                      <div className="text-sm font-medium">Clique ou arraste uma imagem aqui</div>
                      <div className="text-xs mt-1 opacity-75">PNG, JPG ou SVG (Máx. 2MB)</div>
                    </div>
                  </div>
                </label>
              </div>
              
              {logoBase64 && (
                <div className="w-full md:w-48 flex flex-col gap-3 items-center">
                  <div className="text-xs font-medium text-[var(--text-secondary)] self-start">Visualização</div>
                  <div className="w-full aspect-video bg-[var(--background)] border border-[var(--border)] rounded-xl flex items-center justify-center p-4 shadow-sm">
                    <img src={logoBase64} alt="Logo preview" className="max-w-full max-h-full object-contain drop-shadow-sm" />
                  </div>
                  <button 
                    onClick={() => setLogoBase64('')}
                    className="text-sm text-red-500 hover:text-red-600 font-medium px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-md transition-colors w-full"
                  >
                    Remover Logo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
