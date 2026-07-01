import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\frontend\src\pages\AgendaPage.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add the parseComment function inside the component or outside
parse_fn = """const parseComment = (text: string) => {
  const match = text.match(/^\[Tag: (.*?)\]\\s*(.*)$/s)
  if (match) {
    return { tagStr: match[1], content: match[2] }
  }
  return { tagStr: null, content: text }
}

export default function AgendaPage() {"""

content = content.replace("export default function AgendaPage() {", parse_fn)

# Replace the comment rendering
old_comment_render = """                    {item.comments.map(c => (
                      <div key={c.id} className="bg-[var(--surface-raised)] p-3 rounded-lg border border-[var(--border)] text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-[var(--text-primary)]">{c.usuario_email.split('@')[0]}</span>
                          <span className="text-[10px] text-[var(--text-secondary)]">{new Date(c.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="text-[var(--text-secondary)]">{c.comentario}</p>
                      </div>
                    ))}"""

new_comment_render = """                    {item.comments.map(c => {
                      const { tagStr, content } = parseComment(c.comentario);
                      
                      // Assign colors based on tag content
                      let colorClass = "bg-indigo-500 text-white border-indigo-600";
                      if (tagStr?.includes('Tarefa')) colorClass = "bg-amber-500 text-white border-amber-600";
                      if (tagStr?.includes('Chamada')) colorClass = "bg-emerald-500 text-white border-emerald-600";
                      if (tagStr?.includes('Reunião Realizada')) colorClass = "bg-purple-500 text-white border-purple-600";

                      return (
                        <div key={c.id} className="bg-[var(--surface-raised)] p-3 rounded-lg border border-[var(--border)] text-sm relative mt-3 shadow-sm">
                          {tagStr && (
                            <div className={`absolute -top-2.5 right-3 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded shadow-sm border ${colorClass} z-10`}>
                              {tagStr}
                            </div>
                          )}
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-[var(--text-primary)]">{c.usuario_email.split('@')[0]}</span>
                            <span className="text-[10px] text-[var(--text-secondary)]">{new Date(c.created_at).toLocaleString('pt-BR')}</span>
                          </div>
                          <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{content}</p>
                        </div>
                      )
                    })}"""

content = content.replace(old_comment_render, new_comment_render)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Modified AgendaPage.tsx")
