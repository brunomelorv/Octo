import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\frontend\src\pages\NegociosPage.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add availableTags state
old_state = """  const [deals, setDeals] = useState<Negocio[]>([])
  const [loading, setLoading] = useState(true)"""

new_state = """  const [deals, setDeals] = useState<Negocio[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)"""

content = content.replace(old_state, new_state)

# Fetch available tags
old_fetch = """    campanhasService.getCampanhas()
      .then((data) => {
        setCampaigns(data || [])
      })
      .catch((err) => {
        console.error('Error fetching campaigns:', err)
      })
  }, [])"""

new_fetch = """    campanhasService.getCampanhas()
      .then((data) => {
        setCampaigns(data || [])
      })
      .catch((err) => {
        console.error('Error fetching campaigns:', err)
      })

    api.get('/settings/custom-tags')
      .then((res) => {
        if (res.data && res.data.tags) {
          setAvailableTags(res.data.tags)
        }
      })
      .catch(err => console.error("Error fetching tags", err))
  }, [])"""

content = content.replace(old_fetch, new_fetch)

# Update the render input to a select dropdown
old_input = """                          {/* Editable Custom Tags */}
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
                          ) : ("""

new_input = """                          {/* Editable Custom Tags */}
                          {editingTagId === deal.id ? (
                            <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={editingTagValue}
                                onChange={(e) => {
                                  setEditingTagValue(e.target.value)
                                }}
                                className="w-full h-6 px-1.5 text-[10px] border border-[var(--accent)] rounded bg-[var(--surface)] focus:outline-none text-[var(--text-primary)]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setEditingTagId(null)
                                }}
                              >
                                <option value="">Sem Tag</option>
                                {availableTags.map(tag => (
                                  <option key={tag} value={tag}>{tag}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleSaveTag(deal)}
                                className="p-0.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] rounded"
                              >
                                <Check className="h-3 w-3 stroke-[1.5]" />
                              </button>
                            </div>
                          ) : ("""

content = content.replace(old_input, new_input)

# Add import api
old_imports = """import { CampanhasResponse } from '../services/campanhas'
import type { LeadWithCalls, Call } from '../types/lead'"""

new_imports = """import { CampanhasResponse } from '../services/campanhas'
import type { LeadWithCalls, Call } from '../types/lead'
import api from '../services/api'"""

if "import api from '../services/api'" not in content:
    content = content.replace("import type { LeadWithCalls, Call } from '../types/lead'", "import type { LeadWithCalls, Call } from '../types/lead'\nimport api from '../services/api'")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Modified NegociosPage.tsx for select")
