import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\frontend\src\pages\NegociosPage.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add states for tags
old_states = """  const [editingDealId, setEditingDealId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')"""

new_states = """  const [editingDealId, setEditingDealId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagValue, setEditingTagValue] = useState('')"""

content = content.replace(old_states, new_states)

# Add save tag handler
save_tag_handler = """  const handleStartEditTag = (deal: Negocio, e: MouseEvent) => {
    e.stopPropagation()
    setEditingTagId(deal.id)
    setEditingTagValue(deal.tags || '')
  }

  const handleSaveTag = async (deal: Negocio) => {
    const val = editingTagValue.trim()
    if (val === (deal.tags || '')) {
      setEditingTagId(null)
      return
    }

    const previousDeals = [...deals]
    setDeals((prev) =>
      prev.map((d) => (d.id === deal.id ? { ...d, tags: val } : d))
    )
    setEditingTagId(null)

    try {
      await negociosService.updateNegocio(deal.id, { etapa: deal.etapa, valor: deal.valor, tags: val })
    } catch (err) {
      console.error('Failed to save deal tags:', err)
      setDeals(previousDeals)
    }
  }

  const handleStartEditValue"""

content = content.replace("  const handleStartEditValue", save_tag_handler)


# Add the rendering
old_render = """                          {/* Consultant Name */}
                          {deal.usuario_nome && (
                            <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 font-medium bg-[var(--surface-raised)]/40 px-2 py-0.5 rounded border border-dashed border-[var(--border)] w-fit max-w-full truncate">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                              <span className="truncate">Consultor: {deal.usuario_nome}</span>
                            </div>
                          )}

                          {/* Editable Value Box */}"""

new_render = """                          {/* Consultant Name */}
                          {deal.usuario_nome && (
                            <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 font-medium bg-[var(--surface-raised)]/40 px-2 py-0.5 rounded border border-dashed border-[var(--border)] w-fit max-w-full truncate">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                              <span className="truncate">Consultor: {deal.usuario_nome}</span>
                            </div>
                          )}

                          {/* Editable Custom Tags */}
                          {editingTagId === deal.id ? (
                            <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editingTagValue}
                                onChange={(e) => setEditingTagValue(e.target.value)}
                                className="w-full h-6 px-1.5 text-[10px] border border-[var(--accent)] rounded bg-[var(--surface)] focus:outline-none text-[var(--text-primary)]"
                                autoFocus
                                placeholder="Separado por vírgula. Ex: Quente, Prioridade"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTag(deal)
                                  if (e.key === 'Escape') setEditingTagId(null)
                                }}
                              />
                              <button
                                onClick={() => handleSaveTag(deal)}
                                className="p-0.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded"
                              >
                                <Check className="h-3 w-3 stroke-[1.5]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {deal.tags ? (
                                deal.tags.split(',').map(t => t.trim()).filter(Boolean).map((t, idx) => (
                                  <div key={idx} className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 font-medium bg-[var(--surface-raised)]/40 px-2 py-0.5 rounded border border-dashed border-[var(--border)] w-fit max-w-full truncate cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors" onClick={(e) => handleStartEditTag(deal, e)} title="Clique para editar as tags">
                                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0"></span>
                                    <span className="truncate">{t}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 font-medium bg-[var(--surface)] px-2 py-0.5 rounded border border-dashed border-[var(--border)] w-fit max-w-full truncate cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors" onClick={(e) => handleStartEditTag(deal, e)} title="Clique para adicionar tags">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  <span className="truncate">Adicionar Tag</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Editable Value Box */}"""

content = content.replace(old_render, new_render)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Modified NegociosPage.tsx")
