import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\frontend\src\pages\PersonalizacaoPage.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add new state for tags
old_state = """  const [logoBase64, setLogoBase64] = useState('')
  const [isLoading, setIsLoading] = useState(true)"""

new_state = """  const [logoBase64, setLogoBase64] = useState('')
  const [customTagsText, setCustomTagsText] = useState('')
  const [isLoading, setIsLoading] = useState(true)"""

content = content.replace(old_state, new_state)

# Add fetch for custom tags
old_fetch = """      const res = await api.get('/settings/personalizacao')
      if (res.data) {
        setSystemName(res.data.system_name || 'Portal do Frank')
        setPrimaryColor(res.data.primary_color || '')
        setLogoBase64(res.data.logo_base64 || '')
      }"""

new_fetch = """      const [res, tagsRes] = await Promise.all([
        api.get('/settings/personalizacao'),
        api.get('/settings/custom-tags')
      ])
      if (res.data) {
        setSystemName(res.data.system_name || 'Portal do Frank')
        setPrimaryColor(res.data.primary_color || '')
        setLogoBase64(res.data.logo_base64 || '')
      }
      if (tagsRes.data && tagsRes.data.tags) {
        setCustomTagsText(tagsRes.data.tags.join(', '))
      }"""

content = content.replace(old_fetch, new_fetch)

# Add save for custom tags
old_save = """      await api.put('/settings/personalizacao', {
        system_name: systemName,
        primary_color: primaryColor,
        logo_base64: logoBase64
      })"""

new_save = """      await api.put('/settings/personalizacao', {
        system_name: systemName,
        primary_color: primaryColor,
        logo_base64: logoBase64
      })
      await api.put('/settings/custom-tags', {
        tags: customTagsText.split(',').map(t => t.trim()).filter(Boolean)
      })"""

content = content.replace(old_save, new_save)


# Add UI for tags
old_ui = """        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <Type className="w-4 h-4 text-[var(--text-secondary)]" />"""

new_ui = """        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <Type className="w-4 h-4 text-[var(--text-secondary)]" />
              Tags do CRM (Negócios)
            </label>
            <input
              type="text"
              value={customTagsText}
              onChange={(e) => setCustomTagsText(e.target.value)}
              placeholder="Ex: Quente, Prioridade, Sem Dinheiro"
              className="w-full md:w-3/4 px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <p className="text-xs text-[var(--text-secondary)]">As tags que os consultores poderão selecionar no Kanban. Separe-as por vírgulas.</p>
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-8">
            <label className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <Type className="w-4 h-4 text-[var(--text-secondary)]" />"""

content = content.replace(old_ui, new_ui)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Modified PersonalizacaoPage.tsx")
