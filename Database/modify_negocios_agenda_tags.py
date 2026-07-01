import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\frontend\src\pages\NegociosPage.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add parseComment in NegociosPage (or a simple regex)
# I will just inline the regex in the map.

old_render = """                          {/* Call classification tag */}
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide ${getStatusBadgeStyle(deal.status_chamada)}`}>
                              {deal.status_chamada}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)]">{deal.platform || 'Meta'}</span>
                          </div>"""

new_render = """                          {/* Call classification tag */}
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide ${getStatusBadgeStyle(deal.status_chamada)}`}>
                              {deal.status_chamada}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)]">{deal.platform || 'Meta'}</span>
                          </div>
                          
                          {/* Agenda/Manual Tag from latest comment */}
                          {deal.call_anotacoes && deal.call_anotacoes.match(/^\\[Tag: (.*?)\\]/) && (
                            (() => {
                              const match = deal.call_anotacoes.match(/^\\[Tag: (.*?)\\]/);
                              const tagStr = match ? match[1] : null;
                              if (!tagStr) return null;
                              
                              let colorClass = "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400";
                              if (tagStr.includes('Tarefa')) colorClass = "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";
                              if (tagStr.includes('Chamada')) colorClass = "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
                              if (tagStr.includes('Reunião Realizada')) colorClass = "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400";

                              return (
                                <div className={`w-fit px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded shadow-sm border ${colorClass} mt-1`} title="Ação registrada na Agenda do Dia">
                                  {tagStr}
                                </div>
                              )
                            })()
                          )}"""

content = content.replace(old_render, new_render)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Modified NegociosPage.tsx to show Agenda tags")
