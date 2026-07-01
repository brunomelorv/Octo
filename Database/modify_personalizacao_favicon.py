import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\frontend\src\pages\PersonalizacaoPage.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add faviconBase64 to state
old_state = """  const [primaryColor, setPrimaryColor] = useState('')
  const [logoBase64, setLogoBase64] = useState('')
  const [customTagsText, setCustomTagsText] = useState('')"""

new_state = """  const [primaryColor, setPrimaryColor] = useState('')
  const [logoBase64, setLogoBase64] = useState('')
  const [faviconBase64, setFaviconBase64] = useState('')
  const [customTagsText, setCustomTagsText] = useState('')"""
content = content.replace(old_state, new_state)


# Update fetch logic
old_fetch = """      if (res.data) {
        setSystemName(res.data.system_name || 'Portal do Frank')
        setPrimaryColor(res.data.primary_color || '')
        setLogoBase64(res.data.logo_base64 || '')
      }"""

new_fetch = """      if (res.data) {
        setSystemName(res.data.system_name || 'Portal do Frank')
        setPrimaryColor(res.data.primary_color || '')
        setLogoBase64(res.data.logo_base64 || '')
        setFaviconBase64(res.data.favicon_base64 || '')
      }"""
content = content.replace(old_fetch, new_fetch)


# Update save logic
old_save = """      await api.put('/settings/personalizacao', {
        system_name: systemName,
        primary_color: primaryColor,
        logo_base64: logoBase64
      })"""

new_save = """      await api.put('/settings/personalizacao', {
        system_name: systemName,
        primary_color: primaryColor,
        logo_base64: logoBase64,
        favicon_base64: faviconBase64
      })"""
content = content.replace(old_save, new_save)


# Update UI components
# First, update the logoBase64 upload to include a new one for Favicon below it.
old_logo_ui = """                {logoBase64 && (
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
    </div>
  )
}"""

new_logo_ui = """                {logoBase64 && (
                  <div className="w-full md:w-48 flex flex-col gap-3 items-center">
                    <div className="text-xs font-medium text-[var(--text-secondary)] self-start">Visualização do Logo</div>
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

            <div className="space-y-3 border-t border-[var(--border)] pt-8">
              <label className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                Ícone da Aba do Navegador (Favicon)
              </label>
              <p className="text-xs text-[var(--text-secondary)]">Recomendado formato quadrado (ex: 32x32 ou 64x64). Este ícone aparecerá na aba do navegador.</p>
              <div className="flex flex-col md:flex-row items-start gap-8">
                <div className="w-full md:flex-1">
                  <label className="block border-2 border-dashed border-[var(--border)] bg-[var(--background)] rounded-xl p-8 text-center hover:border-[var(--accent)] hover:bg-[var(--surface)] transition-all cursor-pointer relative group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          if (file.size > 1024 * 1024 * 2) {
                            return
                          }
                          const reader = new FileReader()
                          reader.onloadend = () => {
                            setFaviconBase64(reader.result as string)
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    />
                    <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors">
                      <ImageIcon className="w-10 h-10" />
                      <div>
                        <div className="text-sm font-medium">Clique ou arraste o ícone aqui</div>
                        <div className="text-xs mt-1 opacity-75">PNG, JPG ou SVG (Quadrado)</div>
                      </div>
                    </div>
                  </label>
                </div>
                
                {faviconBase64 && (
                  <div className="w-full md:w-32 flex flex-col gap-3 items-center">
                    <div className="text-xs font-medium text-[var(--text-secondary)] self-start">Visualização do Ícone</div>
                    <div className="w-16 h-16 bg-[var(--background)] border border-[var(--border)] rounded-xl flex items-center justify-center p-2 shadow-sm">
                      <img src={faviconBase64} alt="Favicon preview" className="max-w-full max-h-full object-contain drop-shadow-sm rounded" />
                    </div>
                    <button 
                      onClick={() => setFaviconBase64('')}
                      className="text-sm text-red-500 hover:text-red-600 font-medium px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-md transition-colors w-full"
                    >
                      Remover Ícone
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}"""
content = content.replace(old_logo_ui, new_logo_ui)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Modified PersonalizacaoPage.tsx for favicon")
