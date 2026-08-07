import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Paperclip, Send, AlertCircle, Mic, Square, X, FileText } from 'lucide-react'
import { huggyService } from '../services/huggy'
import type { HuggyMessage } from '../services/huggy'
import { audioToMp3 } from '../utils/audioToMp3'

/**
 * The Huggy conversation for one lead, as an actual chat.
 *
 * Owns its own fetching and polling instead of leaning on the page: the drawer is the only
 * surface that goes stale (the webhook is the realtime path everywhere else), and keeping the
 * request here is what let LeadsPage stop rebuilding its timeline on a timer.
 *
 * Reads and writes go through the CRM's own mirror, never straight to Huggy. Media likewise
 * comes back through huggyService.mediaUrl — see the note there for why hotlinking is wrong.
 */

const POLL_MS = 10000
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** A message we sent that Huggy has not confirmed yet, or refused. */
interface PendingMessage {
  key: string
  body: string
  failed: boolean
}

interface Attachment {
  base64: string
  name: string
  /** Object URL for the local preview; revoked when the attachment is dropped. */
  previewUrl: string
  isAudio: boolean
}

interface Props {
  phone: string
  /** Change this to force an immediate refetch, e.g. right after a manual sync. */
  refreshKey?: number
  /**
   * Lets the parent show a count without duplicating the request.
   * Must be stable across renders — it is a dependency of the fetch below.
   */
  onCountChange?: (count: number) => void
}

function formatTime(value?: string | null): string {
  if (!value) return ''
  // Timestamps arrive normalized by to_iso, but a bad one must not take the panel down with a
  // RangeError — the failure mode that blanked the Performance page.
  const parsed = new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T'))
  if (isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function initialsOf(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Profile picture, falling back to initials when there is none or it fails to load. */
function Avatar({ name, photo, inbound }: { name?: string | null; photo?: string | null; inbound: boolean }) {
  const [broken, setBroken] = useState(false)
  const src = broken ? undefined : huggyService.mediaUrl(photo)

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'contato'}
        onError={() => setBroken(true)}
        className="h-7 w-7 rounded-full object-cover shrink-0 border border-[var(--border)]"
      />
    )
  }
  return (
    <div className={`h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold border ${
      inbound
        ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)]'
        : 'bg-[#25D366]/15 border-[#25D366]/30 text-[#128C7E] dark:text-[#25D366]'
    }`}>
      {initialsOf(name)}
    </div>
  )
}

/** Renders whatever Huggy attached: a picture, a player, or a link to download. */
function Attachment({ message }: { message: HuggyMessage }) {
  const src = huggyService.mediaUrl(message.attachment_url)
  if (!src) return null

  if (message.attachment_type === 'image') {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img src={src} alt="anexo" className="rounded-md max-h-52 w-auto object-cover" />
      </a>
    )
  }
  if (message.attachment_type === 'audio') {
    return <audio controls src={src} className="mt-1 w-full max-w-[240px] h-9" />
  }
  if (message.attachment_type === 'video') {
    return <video controls src={src} className="mt-1 rounded-md max-h-52 w-auto" />
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
    >
      <Paperclip className="h-2.5 w-2.5" />
      ver anexo
    </a>
  )
}

export default function HuggyChatPanel({ phone, refreshKey = 0, onCountChange }: Props) {
  const [messages, setMessages] = useState<HuggyMessage[]>([])
  const [inBot, setInBot] = useState(false)
  const [loading, setLoading] = useState(true)
  const [restricted, setRestricted] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [converting, setConverting] = useState(false)

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const load = useCallback(async () => {
    try {
      const data = await huggyService.getLeadMessages(phone)
      // The endpoint answers newest first; a conversation reads the other way round.
      setMessages([...data.items].reverse())
      setInBot(Boolean(data.in_bot))
      setRestricted(Boolean(data.restricted))
      onCountChange?.(data.items.length)
    } catch {
      // Silent on purpose: this also runs on a timer, and the panel already shows what it had.
    } finally {
      setLoading(false)
    }
  }, [phone, onCountChange])

  useEffect(() => {
    setLoading(true)
    setMessages([])
    setPending([])
    load()
  }, [phone, load])

  // A manual sync just pulled new messages; do not make the user wait for the next tick.
  useEffect(() => {
    if (refreshKey) load()
  }, [refreshKey, load])

  useEffect(() => {
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  // Stick to the newest message, the way a chat is expected to behave.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, pending.length])

  // Let go of the microphone and the preview URL if the panel closes mid-recording.
  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop())
      if (attachment) URL.revokeObjectURL(attachment.previewUrl)
    }
  }, [attachment])

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [recording])

  const attachBlob = (blob: Blob, name: string) => {
    if (blob.size > MAX_UPLOAD_BYTES) {
      setError('Arquivo muito grande. O limite é de 8 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({
        base64: String(reader.result || ''),
        name,
        previewUrl: URL.createObjectURL(blob),
        isAudio: blob.type.startsWith('audio/'),
      })
      setError(null)
    }
    reader.readAsDataURL(blob)
  }

  const startRecording = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      // getUserMedia only exists in a secure context: https, or localhost during development.
      setError('Gravação indisponível neste navegador. Requer HTTPS ou localhost.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Prefer ogg/opus, the format WhatsApp uses for voice notes; webm/opus is the fallback
      // Chrome actually supports, and Huggy is left to transcode it.
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) return
        // Huggy refuses what the browser records, so the conversion happens here rather than
        // letting the upload fail with "Arquivo inválido".
        setConverting(true)
        try {
          attachBlob(await audioToMp3(blob), 'nota-de-voz.mp3')
        } catch {
          setError('Não foi possível preparar o áudio gravado.')
        } finally {
          setConverting(false)
        }
      }
      recorderRef.current = recorder
      setRecordSeconds(0)
      setRecording(true)
      recorder.start()
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  const stopRecording = (keep: boolean) => {
    const recorder = recorderRef.current
    setRecording(false)
    if (!recorder) return
    if (!keep) recorder.onstop = () => recorder.stream.getTracks().forEach((t) => t.stop())
    recorder.stop()
    recorderRef.current = null
  }

  const dropAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl)
    setAttachment(null)
  }

  const handleSend = async () => {
    const text = draft.trim()
    if ((!text && !attachment) || sending) return

    const key = `pending-${messages.length}-${text.length}-${pending.length}`
    const label = text || (attachment?.isAudio ? '[áudio]' : '[anexo]')
    setPending((prev) => [...prev, { key, body: label, failed: false }])
    const file = attachment ? { base64: attachment.base64, name: attachment.name } : undefined
    setDraft('')
    dropAttachment()
    setSending(true)
    setError(null)

    try {
      const sent = await huggyService.sendMessage(phone, text, file)
      // Drop the placeholder and show the message Huggy actually accepted.
      setPending((prev) => prev.filter((p) => p.key !== key))
      setMessages((prev) => [...prev, sent])
    } catch (err: any) {
      setPending((prev) => prev.map((p) => (p.key === key ? { ...p, failed: true } : p)))
      setError(err?.response?.data?.detail || 'Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  if (restricted) {
    return (
      <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-lg bg-[var(--surface-raised)]">
        <p className="text-xs text-[var(--text-secondary)]">
          Este lead não está atribuído a você.
        </p>
      </div>
    )
  }

  const canSend = Boolean(draft.trim() || attachment) && !sending && !converting

  return (
    <div className="flex flex-col gap-2">
      {inBot && (
        <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
          <Bot className="h-3.5 w-3.5 stroke-[1.5] text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
            <span className="font-semibold text-amber-600">Em atendimento automático.</span>{' '}
            A Huggy só libera o histórico depois que a conversa for transferida para um agente.
          </p>
        </div>
      )}

      <div className="h-[58vh] min-h-[340px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 space-y-1.5">
        {loading ? (
          <p className="text-center text-xs text-[var(--text-tertiary)] py-8">Carregando conversa...</p>
        ) : messages.length === 0 && pending.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-6 w-6 text-[var(--text-tertiary)] mx-auto mb-2 stroke-[1.5]" />
            <p className="text-xs text-[var(--text-secondary)]">Nenhuma mensagem por aqui ainda.</p>
          </div>
        ) : (
          <>
            {messages.map((message, idx) => {
              // Events are the bot and the platform narrating themselves ("entrou na fila").
              // They belong to neither side, so they get a centred notice instead of a bubble.
              if (message.direction === 'event') {
                return (
                  <div key={message.huggy_message_id} className="flex justify-center py-1">
                    <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--surface)] border border-[var(--border)] rounded-full px-2.5 py-1 text-center">
                      {message.body}
                    </span>
                  </div>
                )
              }

              const inbound = message.direction === 'in'
              // Only the first message of a run carries the avatar and the name, so a burst from
              // one side reads as one block instead of a column of repeated faces.
              const previous = messages[idx - 1]
              const startsRun = !previous
                || previous.direction !== message.direction
                || previous.sender_name !== message.sender_name

              return (
                <div
                  key={message.huggy_message_id}
                  className={`flex items-end gap-1.5 ${inbound ? 'justify-start' : 'justify-end'} ${startsRun ? 'pt-1.5' : ''}`}
                >
                  {inbound && (startsRun
                    ? <Avatar name={message.sender_name} photo={message.sender_photo} inbound />
                    : <div className="w-7 shrink-0" />)}

                  <div className={`max-w-[75%] rounded-lg px-2.5 py-1.5 border ${
                    inbound
                      ? 'bg-[var(--surface)] border-[var(--border)]'
                      : 'bg-[#25D366]/10 border-[#25D366]/25'
                  }`}>
                    {startsRun && message.sender_name && (
                      <p className={`text-[10px] font-semibold mb-0.5 ${
                        inbound ? 'text-[var(--text-secondary)]' : 'text-[#128C7E] dark:text-[#25D366]'
                      }`}>
                        {message.sender_name}
                      </p>
                    )}

                    {message.body && (
                      <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                        {message.body}
                      </p>
                    )}

                    {/* Boolean(): has_attachment is 0|1 from SQLite, and React renders a bare 0
                        as text instead of skipping it. */}
                    {Boolean(message.has_attachment) && <Attachment message={message} />}

                    {!message.body && !message.has_attachment && (
                      <p className="text-xs text-[var(--text-tertiary)]">—</p>
                    )}

                    <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)] text-right">
                      {formatTime(message.created_at)}
                    </div>
                  </div>

                  {!inbound && (startsRun
                    ? <Avatar name={message.sender_name} photo={message.sender_photo} inbound={false} />
                    : <div className="w-7 shrink-0" />)}
                </div>
              )
            })}

            {pending.map((item) => (
              <div key={item.key} className="flex items-end gap-1.5 justify-end">
                <div className={`max-w-[75%] rounded-lg px-2.5 py-1.5 border ${
                  item.failed
                    ? 'bg-red-500/10 border-red-500/25'
                    : 'bg-[#25D366]/10 border-[#25D366]/25 opacity-60'
                }`}>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                    {item.body}
                  </p>
                  <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)] text-right">
                    {item.failed ? 'não enviada' : 'enviando...'}
                  </div>
                </div>
                <div className="w-7 shrink-0" />
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-600">
          <AlertCircle className="h-3.5 w-3.5 stroke-[1.5] shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {converting && (
        <p className="text-[11px] text-[var(--text-secondary)]">Preparando o áudio...</p>
      )}

      {attachment && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)]">
          {attachment.isAudio ? (
            <audio controls src={attachment.previewUrl} className="h-8 flex-1 max-w-[260px]" />
          ) : (
            <>
              <FileText className="h-3.5 w-3.5 stroke-[1.5] text-[var(--text-secondary)] shrink-0" />
              <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1">
                {attachment.name}
              </span>
            </>
          )}
          <button
            onClick={dropAttachment}
            title="Remover anexo"
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5 stroke-[1.5]" />
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-red-500/30 bg-red-500/10">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-xs text-[var(--text-primary)] flex-1">
            Gravando... {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
            {String(recordSeconds % 60).padStart(2, '0')}
          </span>
          <button
            onClick={() => stopRecording(false)}
            className="h-8 px-2.5 rounded-md border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => stopRecording(true)}
            className="h-8 px-2.5 rounded-md bg-[var(--accent)] text-white text-xs inline-flex items-center gap-1.5"
          >
            <Square className="h-3 w-3 fill-current" />
            <span>Parar</span>
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              // Reset so picking the same file twice still fires onChange.
              e.target.value = ''
              if (!file) return
              // An attached ogg/wav/m4a would be refused by Huggy exactly like a recording, so
              // anything audio that is not already mp3 goes through the same conversion.
              if (file.type.startsWith('audio/') && !file.type.includes('mpeg')) {
                setConverting(true)
                try {
                  attachBlob(await audioToMp3(file), file.name.replace(/\.[^.]+$/, '') + '.mp3')
                } catch {
                  setError('Não foi possível converter esse áudio.')
                } finally {
                  setConverting(false)
                }
                return
              }
              attachBlob(file, file.name)
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Anexar imagem ou áudio"
            className="h-9 w-9 shrink-0 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] inline-flex items-center justify-center transition-colors duration-150"
          >
            <Paperclip className="h-4 w-4 stroke-[1.5]" />
          </button>
          <button
            onClick={startRecording}
            title="Gravar áudio"
            className="h-9 w-9 shrink-0 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] inline-flex items-center justify-center transition-colors duration-150"
          >
            <Mic className="h-4 w-4 stroke-[1.5]" />
          </button>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line — what every chat does.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Escreva uma mensagem..."
            className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            title="Enviar pelo WhatsApp via Huggy"
            className="h-9 px-3 shrink-0 rounded-md bg-[#25D366] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-opacity duration-150 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5 stroke-[1.5]" />
            <span>Enviar</span>
          </button>
        </div>
      )}
    </div>
  )
}
