import { useState, useEffect } from 'react'
import { Calendar, MessageSquare, Send, ChevronLeft, ChevronRight, Phone, CheckCircle2, X, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { leadsService } from '../services/leads'
import { agendaService } from '../services/agenda'
import { negociosService } from '../services/negocios'
import type { AgendaItem } from '../services/agenda'
import WhatsAppTemplateSelector from '../components/WhatsAppTemplateSelector'

export default function AgendaPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({})
  const [tagInputs, setTagInputs] = useState<{ [key: string]: { tag: string, date: string } }>({})
  const [submittingComment, setSubmittingComment] = useState<string | null>(null)
  const [rescheduleData, setRescheduleData] = useState<{ [key: string]: { date: string, time: string } }>({})
  
  const [completingItem, setCompletingItem] = useState<AgendaItem | null>(null)
  const [selectedStage, setSelectedStage] = useState<string>('')
  const [lossReason, setLossReason] = useState<string>('')
  const [lossComment, setLossComment] = useState<string>('')
  const [isCompleting, setIsCompleting] = useState(false)

  // Inline History state
  const [expandedCards, setExpandedCards] = useState<string[]>([])
  const [activeContactPhones, setActiveContactPhones] = useState<string[]>([])
  const [historyData, setHistoryData] = useState<Record<string, any>>({})
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({})

  const FUNNEL_STAGES = [
    'Reunião Agendada', 
    'KYC/COF/Contrato', 
    'Ganho', 
    'Perdido'
  ]

  const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    fetchAgenda(dateStr)
  }, [dateStr])

  const fetchAgenda = async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await agendaService.getAgenda(date)
      setItems(data)
    } catch (err) {
      setError('Erro ao carregar a agenda do dia.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + days)
    setCurrentDate(newDate)
  }

  const toggleContact = (phone: string) => {
    setActiveContactPhones(prev =>
      prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]
    )
  }


  const handleAddComment = async (phone: string) => {
    const comment = commentInputs[phone]
    const tagData = tagInputs[phone]
    if (!comment?.trim() && !tagData?.tag) return

    setSubmittingComment(phone)
    try {
      let fullComment = comment || ''
      if (tagData?.tag) {
        fullComment = `[Tag: ${tagData.tag}${tagData.date ? ` - Data: ${tagData.date}` : ''}] ${fullComment}`
      }

      const newComment = await agendaService.addComment(phone, dateStr, fullComment, user.email || 'Usuário')
      
      setItems(prev => prev.map(item => {
        if (item.phone === phone) {
          return {
            ...item,
            comments: [newComment, ...item.comments]
          }
        }
        return item
      }))
      
      setCommentInputs(prev => ({ ...prev, [phone]: '' }))
      setTagInputs(prev => ({ ...prev, [phone]: { tag: '', date: '' } }))
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar comentário e tag')
    } finally {
      setSubmittingComment(null)
    }
  }

  const toggleHistory = (phone: string) => {
    if (expandedCards.includes(phone)) {
      setExpandedCards(prev => prev.filter(p => p !== phone))
      return
    }

    setExpandedCards(prev => [...prev, phone])

    if (!historyData[phone] && !historyLoading[phone]) {
      setHistoryLoading(prev => ({ ...prev, [phone]: true }))
      leadsService.getLeadByPhone(phone)
        .then((data) => {
          setHistoryData(prev => ({ ...prev, [phone]: data }))
        })
        .catch((err) => {
          console.error('Error fetching details:', err)
        })
        .finally(() => {
          setHistoryLoading(prev => ({ ...prev, [phone]: false }))
        })
    }
  }

  const handleCompleteSubmit = async () => {
    if (!completingItem || !selectedStage) return

    setIsCompleting(true)
    try {
      if (completingItem.lead_id) {
        const payload: any = { etapa: selectedStage, valor: 0 }
        if (selectedStage === 'Perdido') {
          payload.loss_reason = lossReason
          payload.loss_comment = lossComment
        }

        await negociosService.updateNegocio(completingItem.lead_id, payload)
      }

      if (selectedStage === 'Reunião Agendada') {
        const data = rescheduleData[completingItem.phone]
        if (data?.date && data?.time) {
          await agendaService.rescheduleItem(completingItem.phone, completingItem.lead_name, data.date, data.time, user.email || 'Usuário')
        }
      }

      await agendaService.completeItem(
        completingItem.chamada_id, 
        user.email || 'Usuário', 
        completingItem.phone, 
        completingItem.lead_name, 
        selectedStage === 'Perdido' ? lossReason : undefined, 
        selectedStage === 'Perdido' ? lossComment : undefined,
        selectedStage
      )
      
      setItems(prev => prev.map(i => i.chamada_id === completingItem.chamada_id ? { ...i, is_completed: true, deal_stage: selectedStage } : i))
      setCompletingItem(null)
      setSelectedStage('')
      setLossReason('')
      setLossComment('')
    } catch (err) {
      console.error(err)
      alert('Erro ao marcar como concluído')
    } finally {
      setIsCompleting(false)
    }
  }

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  }

  const isToday = new Date().toDateString() === currentDate.toDateString()

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[var(--surface)] p-6 rounded-xl border border-[var(--border)] shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Agenda do Dia</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Acompanhe retornos e reuniões agendadas</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => changeDate(-1)}
            className="p-2 rounded-full hover:bg-[var(--surface-raised)] transition-colors border border-[var(--border)]"
          >
            <ChevronLeft className="h-5 w-5 text-[var(--text-secondary)]" />
          </button>
          
          <div className="flex flex-col items-center min-w-[200px]">
            <span className="text-sm font-medium uppercase text-[var(--text-secondary)]">
              {isToday ? 'Hoje' : ''}
            </span>
            <span className="font-semibold text-[var(--text-primary)] capitalize">
              {formatDisplayDate(currentDate)}
            </span>
          </div>

          <button 
            onClick={() => changeDate(1)}
            className="p-2 rounded-full hover:bg-[var(--surface-raised)] transition-colors border border-[var(--border)]"
          >
            <ChevronRight className="h-5 w-5 text-[var(--text-secondary)]" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-center">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <Calendar className="h-12 w-12 mx-auto text-[var(--text-secondary)] opacity-50 mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Nenhum evento para hoje</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Você não tem retornos ou reuniões agendadas para esta data.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item, idx) => (
            <div key={idx} className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm transition-all flex flex-col ${
              item.is_completed ? 'opacity-60 grayscale-[0.5]' : 'hover:border-[var(--brand-primary)]/50'
            }`}>
              
              <div className="flex flex-col md:flex-row gap-6 w-full">
                {/* Event Info */}
                <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                      item.event_type === 'Reunião' 
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' 
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {item.event_type}
                    </span>
                    {item.time && (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                        <Calendar className="h-4 w-4" />
                        {item.time}
                      </span>
                    )}
                    {item.deal_stage && (
                      <span className="px-2 py-0.5 text-xs rounded-md bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)]">
                        Funil: {item.deal_stage}
                      </span>
                    )}
                    {item.is_completed && (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Concluído
                      </span>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">{item.lead_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4 text-[var(--text-secondary)]" />
                    <span className="text-sm text-[var(--text-secondary)]">{item.phone}</span>
                  </div>
                </div>
                
                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3.5 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                  <p className="text-sm text-[var(--text-primary)] leading-relaxed italic border-l-[3px] border-indigo-400 pl-3">
                    "{item.resumo}"
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap gap-2 items-center">
                  <button 
                    onClick={() => toggleContact(item.phone)}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-sm"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {activeContactPhones.includes(item.phone) ? 'Fechar Painel' : 'Contatar'}
                  </button>

                  <button
                    onClick={() => toggleHistory(item.phone)}
                    className="inline-flex items-center gap-1.5 bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] text-sm font-medium py-2 px-3 rounded-lg transition-colors shadow-sm"
                    title="Histórico Completo"
                  >
                    {expandedCards.includes(item.phone) ? (
                      <>
                        Ocultar Histórico
                        <ChevronUp className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Ver Histórico
                        <ChevronDown className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {!item.is_completed && (
                    <button 
                      onClick={() => { setCompletingItem(item); setSelectedStage(item.deal_stage || 'KYC/COF/Contrato'); setRescheduleData(prev => ({ ...prev, [item.phone]: { date: '', time: '' } })); }}
                      className="inline-flex items-center gap-2 bg-[var(--surface-raised)] hover:bg-green-50 text-[var(--text-primary)] hover:text-green-700 border border-[var(--border)] text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Concluir
                    </button>
                  )}
                </div>

                {activeContactPhones.includes(item.phone) && (
                  <WhatsAppTemplateSelector
                    phone={item.phone}
                    leadName={item.lead_name}
                    eventTime={item.time}
                    eventType={item.event_type}
                  />
                )}

                {/* Complete Inline Form */}
                {completingItem?.chamada_id === item.chamada_id && (
                  <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-lg animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-semibold text-green-900 dark:text-green-300">Finalizar Contato e Atualizar Funil</h5>
                      <button onClick={() => setCompletingItem(null)} className="text-green-400 hover:text-green-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[200px]">
                          <label className="block text-xs font-medium text-green-800 dark:text-green-400 mb-1">Para qual etapa o lead avançou?</label>
                          <select 
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value)}
                            className="w-full bg-white dark:bg-[var(--surface)] border border-green-200 dark:border-green-800 rounded-lg px-3 py-1.5 text-sm"
                          >
                            <option value="" disabled>Selecione a etapa...</option>
                            {FUNNEL_STAGES.map(stage => (
                              <option key={stage} value={stage}>{stage}</option>
                            ))}
                          </select>
                        </div>
                        {selectedStage !== 'Perdido' && selectedStage !== 'Reunião Agendada' && (
                          <button
                            onClick={handleCompleteSubmit}
                            disabled={isCompleting || !selectedStage}
                            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                          >
                            {isCompleting ? 'Salvando...' : 'Confirmar'}
                          </button>
                        )}
                      </div>

                      {selectedStage === 'Reunião Agendada' && (
                        <div className="flex flex-wrap gap-3 items-end mt-2 animate-in fade-in slide-in-from-top-1">
                          <div>
                            <label className="block text-xs font-medium text-indigo-800 dark:text-indigo-400 mb-1">Data da Nova Reunião</label>
                            <input 
                              type="date" 
                              value={rescheduleData[item.phone]?.date || ''}
                              onChange={(e) => setRescheduleData(prev => ({ ...prev, [item.phone]: { ...prev[item.phone], date: e.target.value } }))}
                              className="bg-white dark:bg-[var(--surface)] border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-indigo-800 dark:text-indigo-400 mb-1">Hora</label>
                            <input 
                              type="time" 
                              value={rescheduleData[item.phone]?.time || ''}
                              onChange={(e) => setRescheduleData(prev => ({ ...prev, [item.phone]: { ...prev[item.phone], time: e.target.value } }))}
                              className="bg-white dark:bg-[var(--surface)] border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-1.5 text-sm"
                            />
                          </div>
                          <button
                            onClick={handleCompleteSubmit}
                            disabled={isCompleting || !rescheduleData[item.phone]?.date || !rescheduleData[item.phone]?.time}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                          >
                            {isCompleting ? 'Salvando...' : 'Confirmar Agendamento'}
                          </button>
                        </div>
                      )}

                      {selectedStage === 'Perdido' && (
                        <div className="flex flex-col gap-3 mt-2 animate-in fade-in slide-in-from-top-1">
                          <div>
                            <label className="block text-xs font-medium text-red-800 dark:text-red-400 mb-1">Motivo da Perda</label>
                            <select 
                              value={lossReason}
                              onChange={(e) => setLossReason(e.target.value)}
                              className="w-full bg-white dark:bg-[var(--surface)] border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 text-sm"
                            >
                              <option value="" disabled>Selecione o motivo...</option>
                              <optgroup label="Agendamento e Retorno">
                                <option value="Agendamento e Retorno">Agendamento e Retorno</option>
                                <option value="Pediu para Ligar Depois">Pediu para Ligar Depois</option>
                                <option value="Agendou Reunião">Agendou Reunião</option>
                                <option value="Aguardando Retorno do Lead">Aguardando Retorno do Lead</option>
                              </optgroup>
                              <optgroup label="Interesse Comercial">
                                <option value="Interesse Comercial">Interesse Comercial</option>
                                <option value="Interesse Geral no Produto">Interesse Geral no Produto</option>
                                <option value="Pediu Mais Informações / Apresentação">Pediu Mais Informações / Apresentação</option>
                                <option value="Necessidade Alinhada">Necessidade Alinhada</option>
                              </optgroup>
                              <optgroup label="Sem Contato Efetivo">
                                <option value="Sem Contato Efetivo">Sem Contato Efetivo</option>
                                <option value="Caixa Postal / Chamando">Caixa Postal / Chamando</option>
                                <option value="Ligação Curta / Sem Diálogo">Ligação Curta / Sem Diálogo</option>
                                <option value="Lead Ocupado / Em Reunião">Lead Ocupado / Em Reunião</option>
                              </optgroup>
                              <optgroup label="Fase de Avaliação">
                                <option value="Fase de Avaliação">Fase de Avaliação</option>
                                <option value="Avaliando Internamente">Avaliando Internamente</option>
                              </optgroup>
                              <optgroup label="Sem Fit Comercial">
                                <option value="Sem Fit Comercial">Sem Fit Comercial</option>
                                <option value="Fora do Perfil de Cliente Ideal">Fora do Perfil de Cliente Ideal</option>
                                <option value="Sem Orçamento / Caro">Sem Orçamento / Caro</option>
                              </optgroup>
                              <optgroup label="Sem Interesse">
                                <option value="Sem Interesse">Sem Interesse</option>
                                <option value="Recusa Direta / Sem Interesse">Recusa Direta / Sem Interesse</option>
                                <option value="Lead Hostil / Irritado">Lead Hostil / Irritado</option>
                              </optgroup>
                              <optgroup label="Erro de Cadastro">
                                <option value="Erro de Cadastro">Erro de Cadastro</option>
                                <option value="Número Errado / Outra Pessoa">Número Errado / Outra Pessoa</option>
                              </optgroup>
                              <optgroup label="Outros">
                                <option value="Fit de Perfil">Fit de Perfil</option>
                                <option value="Problemas de Comunicação">Problemas de Comunicação</option>
                                <option value="Falta de Tempo Pediu para Ligar Depois">Falta de Tempo Pediu para Ligar Depois</option>
                                <option value="Outro">Outro</option>
                              </optgroup>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-red-800 dark:text-red-400 mb-1">Comentário Adicional</label>
                            <textarea 
                              value={lossComment}
                              onChange={(e) => setLossComment(e.target.value)}
                              placeholder="Descreva brevemente o que houve..."
                              className="w-full bg-white dark:bg-[var(--surface)] border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm"
                              rows={2}
                            />
                          </div>
                          <div className="flex justify-end mt-1">
                            <button
                              onClick={handleCompleteSubmit}
                              disabled={isCompleting || !lossReason || !lossComment.trim()}
                              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-1.5 px-6 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                            >
                              {isCompleting ? 'Salvando...' : 'Confirmar Perda'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Comments Section */}
              <div className="md:w-[400px] flex flex-col border-t md:border-t-0 md:border-l border-[var(--border)] pt-4 md:pt-0 md:pl-6">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-[var(--text-primary)] mb-4">
                  <MessageSquare className="h-4 w-4" />
                  Anotações da Agenda
                </h4>
                
                <div className="flex gap-2 mb-4">
                  <input 
                    type="text"
                    value={commentInputs[item.phone] || ''}
                    onChange={(e) => setCommentInputs(prev => ({ ...prev, [item.phone]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddComment(item.phone)
                    }}
                    placeholder="Adicionar um comentário..."
                    className="flex-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <button 
                    onClick={() => handleAddComment(item.phone)}
                    disabled={submittingComment === item.phone || (!commentInputs[item.phone]?.trim() && !tagInputs[item.phone]?.tag) || (tagInputs[item.phone]?.tag === 'Tarefa' && !tagInputs[item.phone]?.date)}
                    className="bg-[var(--text-primary)] text-[var(--surface)] p-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                
                {/* Tag System */}
                <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg p-3 mb-4 space-y-3">
                  <h5 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Registrar Ação / Tag</h5>
                  <div className="flex flex-wrap gap-2">
                    {['Tarefa', 'Chamada', 'Reunião Realizada'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setTagInputs(prev => ({ ...prev, [item.phone]: { ...prev[item.phone], tag: prev[item.phone]?.tag === tag ? '' : tag } }))}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${tagInputs[item.phone]?.tag === tag ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800' : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--surface-hover)]'}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  {tagInputs[item.phone]?.tag === 'Tarefa' && (
                    <div className="animate-in fade-in slide-in-from-top-1 mt-2">
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Data da Tarefa (Obrigatória)</label>
                      <input 
                        type="date"
                        value={tagInputs[item.phone]?.date || ''}
                        onChange={(e) => setTagInputs(prev => ({ ...prev, [item.phone]: { ...prev[item.phone], date: e.target.value } }))}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </div>
                
                {/* Comments Section */}
                {item.comments && item.comments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h5 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Comentários</h5>
                    {item.comments.map(c => (
                      <div key={c.id} className="bg-[var(--surface-raised)] p-3 rounded-lg border border-[var(--border)] text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-[var(--text-primary)]">{c.usuario_email.split('@')[0]}</span>
                          <span className="text-[10px] text-[var(--text-secondary)]">{new Date(c.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="text-[var(--text-secondary)]">{c.comentario}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* End of Columns */}
              </div>

              {/* Inline History Timeline */}
              {expandedCards.includes(item.phone) && (
                <div className="mt-6 pt-6 border-t border-[var(--border)] animate-in slide-in-from-top-2 w-full">
                  <h4 className="text-[13px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Linha do Tempo
                  </h4>
                  
                  {historyLoading[item.phone] ? (
                    <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)] p-4 bg-[var(--surface-raised)] rounded-lg">
                      <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
                      Carregando histórico...
                    </div>
                  ) : historyData[item.phone] ? (
                    <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-[var(--border)]">
                      {historyData[item.phone].chamadas?.map((call: any, cIdx: number) => {
                        const dateObj = new Date(call.data_hora)
                        const dateStr = dateObj.toLocaleDateString('pt-BR')
                        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        
                        return (
                          <div key={cIdx} className="relative pl-8">
                            <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-[var(--surface)] border-2 border-[var(--accent)] flex items-center justify-center z-10 shadow-sm">
                              <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                            </div>
                            <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <span className="text-xs font-semibold text-[var(--text-primary)]">
                                  {dateStr} às {timeStr}
                                </span>
                                <div className="flex items-center gap-2">
                                  {call.status_ligacao && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                                      {call.status_ligacao}
                                    </span>
                                  )}
                                  {call.duracao_segundos > 0 && (
                                    <span className="text-[10px] bg-[var(--surface)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                                      {call.duracao_segundos}s
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {call.resumo_ligacao && (
                                <div className="text-sm text-[var(--text-secondary)] leading-relaxed mt-1">
                                  {call.resumo_ligacao}
                                </div>
                              )}

                              {call.tag && (
                                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[var(--border)]/50">
                                  {call.tag.split(',').map((t: string, tIdx: number) => (
                                    <span key={tIdx} className="text-[9px] uppercase tracking-wider font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded">
                                      {t.trim()}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)] italic">Nenhum histórico encontrado.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
