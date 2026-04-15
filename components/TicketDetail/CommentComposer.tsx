'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Flex, Select, message } from 'antd'
import { CommentOutlined, SendOutlined, PaperClipOutlined, DeleteOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import CommentWysiwyg from './CommentWysiwyg'
import { uploadTicketFile } from '@/utils/storage'

export type CommentExtra = {
  taggedUserIds?: string[]
  ccEmails?: string[]
  bccEmails?: string[]
}

interface NonCustomerUser {
  id: string
  full_name?: string | null
  email: string
}

interface CommentComposerProps {
  ticketId: number
  companyName: string
  onAddComment: (
    commentText: string,
    attachments: { url: string; file_name: string; file_path: string }[],
    extra?: CommentExtra
  ) => Promise<void>
  loading?: boolean
  /** When `showNoteOption`, `null` = belum pilih mode (hanya tombol Add note / Reply). */
  commentVisibility?: 'note' | 'reply' | null
  onCommentVisibilityChange?: (v: 'note' | 'reply') => void
  showNoteOption?: boolean
  /** Non-customer users for tagging in notes (role !== 'customer') */
  nonCustomerUsers?: NonCustomerUser[]
  /** Company customers for CC/BCC preselect (users in ticket's company) */
  companyCustomers?: Array<{ id: string; full_name: string | null; email: string }>
  /** Emails ever CC'd on this ticket - pre-fill CC for auto-CC on replies */
  ticketCcEmails?: string[]
  /** Portal customer: hide CC/BCC (no outbound copy). */
  showReplyCcBcc?: boolean
}

export default function CommentComposer({
  ticketId,
  companyName,
  onAddComment,
  loading = false,
  commentVisibility,
  onCommentVisibilityChange,
  showNoteOption = false,
  nonCustomerUsers = [],
  companyCustomers = [],
  ticketCcEmails = [],
  showReplyCcBcc = true,
}: CommentComposerProps) {
  const isBlankEditorValue = (value: string): boolean => {
    const textOnly = String(value || '')
      .replace(/<p><br><\/p>/gi, '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
    return textOnly.length === 0
  }

  /** Customer / non-agent UI: selalu reply. Agent with note+reply: honor null = pilih dulu. */
  const mode = showNoteOption ? commentVisibility ?? null : 'reply'

  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>(() => {
    if (!showReplyCcBcc) return []
    const emails = (ticketCcEmails ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => e && e.includes('@'))
    return emails
  })
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const isReplyMode = (showNoteOption && mode === 'reply') || !showNoteOption

  /** One fetch per ticket per "reply session"; reset after successful send or ticket change. */
  const agentReplyTemplateConsumedRef = useRef(false)
  const agentReplyTemplateHtmlRef = useRef('')
  const agentReplyTemplateLoadingRef = useRef(false)

  const applyTemplateIfPossible = (html: string) => {
    if (!html.trim()) return
    if (agentReplyTemplateConsumedRef.current) return
    if (!isReplyMode) return
    setDraft((prev) => {
      if (!isBlankEditorValue(prev)) return prev
      agentReplyTemplateConsumedRef.current = true
      return html
    })
  }

  const fetchAgentReplyTemplate = async () => {
    if (agentReplyTemplateLoadingRef.current) return
    agentReplyTemplateLoadingRef.current = true
    try {
      const res = await fetch(`/api/tickets/${ticketId}/agent-reply-template`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as { html?: string }
      const html = typeof data.html === 'string' ? data.html.trim() : ''
      agentReplyTemplateHtmlRef.current = html
      applyTemplateIfPossible(html)
    } catch {
      // optional prefill, ignore network/auth errors
    } finally {
      agentReplyTemplateLoadingRef.current = false
    }
  }

  useEffect(() => {
    agentReplyTemplateConsumedRef.current = false
    agentReplyTemplateHtmlRef.current = ''
    void fetchAgentReplyTemplate()
  }, [ticketId])

  useEffect(() => {
    if (!isReplyMode) return
    if (agentReplyTemplateHtmlRef.current) {
      applyTemplateIfPossible(agentReplyTemplateHtmlRef.current)
      return
    }
    void fetchAgentReplyTemplate()
  }, [isReplyMode, ticketId])

  const baseCcOptions = companyCustomers
    .filter((u) => u.email?.trim())
    .map((u) => ({
      value: u.email.trim().toLowerCase(),
      label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
    }))
  const ticketCcSet = new Set((ticketCcEmails ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => e && e.includes('@')))
  const ticketCcOnlyOptions = [...ticketCcSet]
    .filter((e) => !baseCcOptions.some((o) => o.value === e))
    .map((e) => ({ value: e, label: e }))
  const ccOptions = [...baseCcOptions, ...ticketCcOnlyOptions]

  const tagAgentOptions = useMemo(
    () =>
      nonCustomerUsers.map((u) => ({
        value: u.id,
        label: u.full_name ? `${u.full_name} (${u.email})` : u.email || u.id,
      })),
    [nonCustomerUsers]
  )

  const filterTagAgents = (input: string, option?: { value?: string; label?: unknown }) => {
    if (!input.trim()) return true
    const id = option?.value
    if (!id || typeof id !== 'string') return false
    const u = nonCustomerUsers.find((x) => x.id === id)
    if (!u) return false
    const q = input.trim().toLowerCase()
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    )
  }

  const handleSubmit = async () => {
    if (showNoteOption && mode == null) return
    if (!draft.trim() && attachments.length === 0) return
    try {
      const extra: CommentExtra = {}
      if (showNoteOption && mode === 'note' && taggedUserIds.length > 0) {
        extra.taggedUserIds = taggedUserIds
      }
      if (showReplyCcBcc && isReplyMode) {
        const cc = ccEmails.filter((e) => e?.trim() && e.includes('@'))
        const bcc = bccEmails.filter((e) => e?.trim() && e.includes('@'))
        if (cc.length > 0) extra.ccEmails = cc
        if (bcc.length > 0) extra.bccEmails = bcc
      }
      await onAddComment(draft.trim(), attachments, Object.keys(extra).length > 0 ? extra : undefined)
      setDraft('')
      setAttachments([])
      setTaggedUserIds([])
      setCcEmails([])
      setBccEmails([])
      agentReplyTemplateConsumedRef.current = false
    } catch {
      // Error already shown by parent
    }
  }

  const handleFilesSelected = async (files: File[] | FileList | null) => {
    const arr = files ? Array.from(files) : []
    if (!arr.length) return
    setUploading(true)
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]
        const result = await uploadTicketFile(file, ticketId, 'comments', companyName)
        if (result.url && result.path) {
          setAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
        } else if (result.error) {
          message.error(`${file.name}: ${result.error}`)
        }
      }
    } finally {
      setUploading(false)
    }
  }

  const placeholder = showNoteOption
    ? mode === 'note'
      ? 'Add a note (agent only)...'
      : 'Reply (visible to client)...'
    : 'Add a comment...'

  const isNote = showNoteOption && mode === 'note'
  const bgColor = isNote ? '#fffbe6' : '#e6f7ff'
  const borderColor = isNote ? '#ffe5b4' : '#91caff'

  const modePicker =
    showNoteOption && onCommentVisibilityChange ? (
      <Flex gap={8} wrap="wrap">
        <Button
          type={mode === 'note' ? 'primary' : 'default'}
          icon={<CommentOutlined />}
          onClick={() => onCommentVisibilityChange('note')}
        >
          Add note
        </Button>
        <Button
          type={mode === 'reply' ? 'primary' : 'default'}
          icon={<SendOutlined />}
          onClick={() => onCommentVisibilityChange('reply')}
        >
          Reply
        </Button>
      </Flex>
    ) : null

  if (showNoteOption && mode == null) {
    return (
      <Flex vertical gap={8} style={{ marginTop: 8 }}>
        {modePicker}
      </Flex>
    )
  }

  return (
    <Flex vertical gap={8} style={{ marginTop: 8, backgroundColor: bgColor, padding: 16, borderRadius: 8, border: `1px solid ${borderColor}` }}>
      {modePicker}
      {showNoteOption && mode === 'note' && nonCustomerUsers.length > 0 && (
        <Flex align="center" gap={8}>
          <UserAddOutlined style={{ color: '#666' }} />
          <Select
            mode="multiple"
            placeholder="Tag agents (optional) — search by name or email"
            value={taggedUserIds}
            onChange={setTaggedUserIds}
            options={tagAgentOptions}
            allowClear
            showSearch
            filterOption={filterTagAgents}
            style={{ minWidth: 200, flex: 1 }}
            maxTagCount="responsive"
          />
        </Flex>
      )}
      {showReplyCcBcc && ((showNoteOption && mode === 'reply') || !showNoteOption) && (
        <Flex vertical gap={6}>
          <Flex align="center" gap={8}>
            <span style={{ fontSize: 12, color: '#666', minWidth: 36 }}>CC</span>
            <Select
              mode="tags"
              placeholder="Optional: select from company or type email"
              value={ccEmails}
              onChange={(v) => setCcEmails(Array.isArray(v) ? v : [])}
              options={ccOptions}
              allowClear
              style={{ flex: 1, minWidth: 200 }}
              maxTagCount="responsive"
              tokenSeparators={[',', ';', ' ']}
            />
          </Flex>
          {showNoteOption && (
            <Flex align="center" gap={8}>
              <span style={{ fontSize: 12, color: '#666', minWidth: 36 }}>BCC</span>
              <Select
                mode="tags"
                placeholder="Optional: type email (BCC, no company preselect)"
                value={bccEmails}
                onChange={(v) => setBccEmails(Array.isArray(v) ? v : [])}
                options={[]}
                allowClear
                style={{ flex: 1, minWidth: 200 }}
                maxTagCount="responsive"
                tokenSeparators={[',', ';', ' ']}
              />
            </Flex>
          )}
        </Flex>
      )}
      <CommentWysiwyg
        ticketId={ticketId}
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        height="200px"
      />
      <br />
      {attachments.length > 0 && (
        <Flex gap={8} wrap="wrap" align="center">
          {attachments.map((a, i) => (
            <Flex key={i} align="center" gap={4} style={{ padding: '4px 8px', background: '#f5f5f5', borderRadius: 6 }}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <PaperClipOutlined /> {a.file_name}
              </a>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
            </Flex>
          ))}
        </Flex>
      )}
      <Flex gap={8} vertical>
        <div >
        <input
          type="file"
          multiple
          style={{ display: 'none' }}
          id="comment-files-input"
          onChange={(e) => {
            const fileList = e.target.files
            const filesArray = fileList ? Array.from(fileList) : []
            e.target.value = ''
            handleFilesSelected(filesArray)
          }}
        />
        </div>
        
        <Flex gap={8}>
        <Button
          icon={<PaperClipOutlined />}
          onClick={() => document.getElementById('comment-files-input')?.click()}
          loading={uploading}
        >
          Attach files
        </Button>
        <Button
          type="primary"
          style={{ width: '200px' }}
          icon={<PlusOutlined />}
          onClick={handleSubmit}
          loading={loading}
          disabled={loading}
        >
          {showNoteOption ? (mode === 'note' ? 'Add note' : 'Reply') : 'Reply'}
        </Button>
        </Flex>
      </Flex>
    </Flex>
  )
}
