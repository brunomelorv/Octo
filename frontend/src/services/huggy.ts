import api from './api'

export interface HuggyStatus {
  enabled: boolean
  /** A token string exists — NOT proof that Huggy accepts it. */
  has_token: boolean
  /** Huggy accepted the credentials on a real API call. */
  verified: boolean
  last_verified_at?: string | null
  client_id: string
  client_secret_masked: string
  company_id: string
  /** Panel URL template, may contain {chat_id}. */
  panel_chat_url: string
  token_expires_at?: string | null
  days_to_expiry?: number | null
  webhook_configured: boolean
  webhook_armed_until?: string | null
  last_webhook_at?: string | null
  last_error?: string | null
  last_error_at?: string | null
  unmatched_contacts: number
  agents_mapped: number
  agents_total: number
}

export interface HuggyMessage {
  huggy_message_id: string
  huggy_chat_id?: string | null
  direction: 'in' | 'out' | 'event'
  sender_type?: string | null
  sender_name?: string | null
  usuario_email?: string | null
  body?: string | null
  has_attachment?: number
  attachment_url?: string | null
  /** How to render the attachment: picture, player, or plain link. */
  attachment_type?: 'image' | 'audio' | 'video' | 'file' | null
  /** Avatar URL as Huggy gave it. Load it through huggyService.mediaUrl, never directly. */
  sender_photo?: string | null
  created_at: string
}

export interface HuggyAgent {
  id: string
  name: string
  email: string
}

export interface HuggyAgentRow {
  user_id: number
  email: string
  name: string
  role: string
  huggy_agent_id?: string | null
  suggested_agent_id?: string | null
  suggested_agent_name?: string | null
}

export const huggyService = {
  async getStatus(): Promise<HuggyStatus> {
    const response = await api.get('/huggy/status')
    return response.data
  },

  async updateConfig(data: {
    client_id?: string
    client_secret?: string
    company_id?: string
    panel_chat_url?: string
    enabled?: boolean
    /** Token from Huggy's "gerador rápido de token" — the only way in while on localhost. */
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }): Promise<HuggyStatus> {
    const response = await api.put('/huggy/config', data)
    return response.data
  },

  async test(): Promise<{ ok: boolean; agent_name?: string | null }> {
    const response = await api.post('/huggy/test')
    return response.data
  },

  /** Returns the Huggy consent URL. The caller must navigate the full page to it. */
  async oauthStart(): Promise<{ authorize_url: string }> {
    const response = await api.post('/huggy/oauth/start')
    return response.data
  },

  async oauthRefresh(): Promise<HuggyStatus> {
    const response = await api.post('/huggy/oauth/refresh')
    return response.data
  },

  async armWebhook(): Promise<{ armed_until: string; minutes: number }> {
    const response = await api.post('/huggy/webhook/arm')
    return response.data
  },

  async getAgents(): Promise<{
    users: HuggyAgentRow[]
    /** Every Huggy agent, for the selector. */
    agents: HuggyAgent[]
    unmatched_agents: HuggyAgent[]
  }> {
    const response = await api.get('/huggy/agents')
    return response.data
  },

  async mapAgents(mappings: { user_id: number; huggy_agent_id: string | null }[]) {
    const response = await api.put('/huggy/agents/map', { mappings })
    return response.data
  },

  /** Mirrored conversation, read from the CRM's own database (never hits Huggy). */
  async getLeadMessages(phone: string, since?: string): Promise<{
    items: HuggyMessage[]
    restricted: boolean
    /** Huggy's `situation` for the most recent chat, e.g. 'auto' | 'in_chat' | 'finishing'. */
    chat_situation?: string | null
    /** Chat still handled by the bot: Huggy will not expose its messages over the API. */
    in_bot?: boolean
    /**
     * The only glimpse Huggy gives of a bot conversation: its last message and unread count.
     * Null once the chat reaches an agent, since the mirrored messages are the real history.
     */
    last_message?: {
      text: string | null
      sender: string | null
      created_at: string | null
      unread: number | null
    } | null
  }> {
    const response = await api.get(`/huggy/leads/${encodeURIComponent(phone)}/messages`, {
      params: since ? { since } : undefined,
    })
    return response.data
  },

  /** Ensures a Huggy contact + open chat assigned to the caller's agent. */
  async openChat(phone: string): Promise<{
    contact_id: string
    chat_id: string | null
    assigned: boolean
    agent_mapped: boolean
    /** URL that opens the conversation in Huggy; falls back to the inbox. */
    deep_link: string
  }> {
    const response = await api.post(`/huggy/leads/${encodeURIComponent(phone)}/chat`)
    return response.data
  },

  /** Recovery path for webhooks that never arrived. Idempotent. */
  async syncLead(phone: string): Promise<{
    synced: number
    chats: number
    /** Chats skipped because the bot still owns them. */
    in_bot?: number
    message?: string | null
  }> {
    const response = await api.post(`/huggy/leads/${encodeURIComponent(phone)}/sync`)
    return response.data
  },

  /** Sends a WhatsApp message to the lead through Huggy. Reaches a real customer. */
  async sendMessage(
    phone: string,
    text: string,
    file?: { base64: string; name?: string },
  ): Promise<HuggyMessage> {
    const response = await api.post(`/huggy/leads/${encodeURIComponent(phone)}/messages`, {
      text,
      file_base64: file?.base64,
      file_name: file?.name,
    })
    return response.data
  },

  /**
   * Same-origin URL for a Huggy image, avatar or audio.
   *
   * Media is proxied rather than hotlinked: the app's CSP declares `img-src 'self'`, and an
   * attachment behind Huggy's API needs a bearer token the browser must never hold.
   */
  mediaUrl(url?: string | null): string | undefined {
    if (!url) return undefined
    return `${api.defaults.baseURL || ''}/huggy/media?url=${encodeURIComponent(url)}`
  },

  async getUnmatchedContacts(): Promise<{ items: any[] }> {
    const response = await api.get('/huggy/contacts/unmatched')
    return response.data
  },

  async linkContact(contactId: string, leadId: string) {
    const response = await api.post(
      `/huggy/contacts/${encodeURIComponent(contactId)}/link`, { lead_id: leadId }
    )
    return response.data
  },

  async createLeadFromContact(contactId: string) {
    const response = await api.post(
      `/huggy/contacts/${encodeURIComponent(contactId)}/create-lead`
    )
    return response.data
  },
}
