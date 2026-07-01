import { useState, useEffect } from 'react'
import { MessageSquare, ExternalLink, Copy, Check } from 'lucide-react'

interface WhatsAppTemplateSelectorProps {
  phone?: string
  leadName?: string
  campaignName?: string
  eventTime?: string
  eventType?: string
}

const TEMPLATES = [
  {
    id: 'primeiro_contato',
    label: 'Apresentação / Primeiro Contato',
    text: 'Olá, {nome}! Tudo bem? Vi seu interesse em nosso produto/serviço através da campanha {campanha} e gostaria de entender melhor como podemos te ajudar. Tem alguns minutos para conversarmos hoje?'
  },
  {
    id: 'follow_up',
    label: 'Follow-up / Acompanhamento',
    text: 'Olá, {nome}! Estou passando para saber se você conseguiu analisar a proposta que enviamos. Qualquer dúvida, estou à disposição para ajudar!'
  },
  {
    id: 'agendamento',
    label: 'Agendamento de Reunião',
    text: 'Olá, {nome}! Gostaria de agendar uma breve conversa para alinharmos os detalhes do seu projeto. Qual o melhor dia e horário para você?'
  },
  {
    id: 'lembrete',
    label: 'Lembrete de Compromisso',
    text: 'Olá, {nome}! Passando para confirmar nosso compromisso ({evento}) agendado para {horario}. Nos falamos em breve!'
  },
  {
    id: 'personalizado',
    label: 'Mensagem Livre (Personalizada)',
    text: 'Olá, {nome}!'
  }
]

const getFirstName = (fullName?: string) => {
  if (!fullName) return 'Cliente'
  const first = fullName.trim().split(' ')[0]
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export default function WhatsAppTemplateSelector({
  phone,
  leadName,
  campaignName,
  eventTime,
  eventType
}: WhatsAppTemplateSelectorProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATES[0].id)
  const [messageText, setMessageText] = useState('')
  const [copied, setCopied] = useState(false)

  // Update text when template or lead details change
  useEffect(() => {
    const template = TEMPLATES.find((t) => t.id === selectedTemplateId)
    if (template) {
      const firstName = getFirstName(leadName)
      const fullName = leadName || 'Cliente'
      const campaign = campaignName || 'anúncio'
      const time = eventTime || 'hoje'
      const type = eventType || 'compromisso'

      const interpolated = template.text
        .replace(/{nome}/g, firstName)
        .replace(/{nome_completo}/g, fullName)
        .replace(/{campanha}/g, campaign)
        .replace(/{horario}/g, time)
        .replace(/{evento}/g, type)

      setMessageText(interpolated)
    }
  }, [selectedTemplateId, leadName, campaignName, eventTime, eventType])

  const getWhatsAppLink = () => {
    if (!phone) return '#'
    const cleanPhone = phone.replace(/\D/g, '')
    const whatsappUrl = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone
    return `https://wa.me/${whatsappUrl}?text=${encodeURIComponent(messageText)}`
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  if (!phone) return null

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3.5 space-y-3 transition-colors duration-150 mt-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 stroke-[1.5] text-emerald-500" />
          <span>Iniciar Contato (WhatsApp)</span>
        </label>
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30">
          Templates de Mensagem
        </span>
      </div>

      <div className="space-y-2">
        {/* Template Select Dropdown */}
        <div>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="w-full bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors cursor-pointer"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Message Editor/Preview */}
        <div className="relative">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={4}
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-md p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors leading-relaxed resize-none"
            placeholder="Digite sua mensagem personalizada..."
          />
          <button
            onClick={handleCopy}
            className="absolute bottom-2.5 right-2.5 p-1.5 rounded-md bg-[var(--surface-raised)] border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shadow-sm"
            title="Copiar mensagem"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 stroke-[1.5]" />
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="pt-0.5">
          <a
            href={getWhatsAppLink()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full h-9 bg-[#22c55e] hover:bg-[#16a34a] text-white font-semibold text-xs rounded-md transition-colors duration-150 shadow-sm"
          >
            <MessageSquare className="h-4 w-4 stroke-[1.5]" />
            <span>Enviar no WhatsApp ({phone})</span>
            <ExternalLink className="h-3.5 w-3.5 stroke-[1.5]" />
          </a>
        </div>
      </div>
    </div>
  )
}
