'use client'

import Link from 'next/link'
import { useState } from 'react'

import { BottomNav } from '../../_components'
import { PRIORITY_COLOR } from '../../_mock'

interface Comment {
  id: number
  author: string
  role: 'customer' | 'agent'
  body: string
  isNote: boolean
  createdAt: string
}

interface Ticket {
  id: number
  title: string
  priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
  description: string
  status: string
  statusColor: string
  company: string
  assignee: string
  createdAt: string
  comments: Comment[]
}

interface Props {
  ticket: Ticket
  isCustomer: boolean
}

export default function DetailClient({ ticket, isCustomer }: Props) {
  const [comments, setComments] = useState<Comment[]>(ticket.comments)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!replyText.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: replyText.trim(),
          is_note: !isCustomer,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setComments((prev) => [...prev, {
          id: data.id ?? Date.now(),
          author: data.author_name ?? 'You',
          role: isCustomer ? 'customer' : 'agent',
          body: replyText.trim(),
          isNote: !isCustomer,
          createdAt: new Date().toLocaleTimeString('id', { hour: '2-digit', minute: '2-digit' }),
        }])
        setReplyText('')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '12px 14px', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Link href="/m/tickets" style={{ color: '#7c3aed', textDecoration: 'none', fontSize: 22, lineHeight: 1, marginRight: 2 }}>‹</Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>#{ticket.id}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[ticket.priority], background: `${PRIORITY_COLOR[ticket.priority]}22`, border: `1px solid ${PRIORITY_COLOR[ticket.priority]}44`, borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>
          {ticket.priority}
        </span>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Priority + Status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: PRIORITY_COLOR[ticket.priority], background: `${PRIORITY_COLOR[ticket.priority]}22`, border: `1px solid ${PRIORITY_COLOR[ticket.priority]}44`, borderRadius: 6, padding: '4px 10px' }}>
            {ticket.priority}
          </span>
          <span style={{ fontSize: 12, color: ticket.statusColor, background: `${ticket.statusColor}18`, border: `1px solid ${ticket.statusColor}44`, borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 8 }}>●</span>{ticket.status}
          </span>
        </div>

        {/* Meta */}
        <div style={{ background: '#1a1a2e', borderRadius: 10, border: '1px solid #2a2a3e', overflow: 'hidden' }}>
          {!isCustomer && <MetaRow label="Company" value={ticket.company} />}
          {!isCustomer && <MetaRow label="Assignee" value={ticket.assignee} />}
          <MetaRow label="Created" value={ticket.createdAt} last />
        </div>

        {/* Description */}
        {ticket.description && (
          <div>
            <SectionLabel>Description</SectionLabel>
            <div
              style={{ background: '#1a1a2e', borderRadius: 10, border: '1px solid #2a2a3e', padding: '12px 14px', fontSize: 13, color: '#d0d0d0', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word' }}
              dangerouslySetInnerHTML={{ __html: ticket.description }}
            />
          </div>
        )}

        {/* Comments */}
        <div>
          <SectionLabel>Conversation ({comments.length})</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comments.length === 0 && (
              <div style={{ fontSize: 13, color: '#8c8c8c' }}>No messages yet</div>
            )}
            {comments.map((c) => {
              const isMe = (isCustomer && c.role === 'customer') || (!isCustomer && c.role === 'agent')
              return (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3, paddingLeft: 4, paddingRight: 4 }}>
                    {c.author} · {c.createdAt}
                    {c.isNote && <span style={{ marginLeft: 6, fontSize: 10, color: '#fa8c16', background: '#fa8c1622', border: '1px solid #fa8c1644', borderRadius: 4, padding: '1px 5px' }}>Note</span>}
                  </div>
                  <div
                    style={{ maxWidth: '85%', background: isMe ? '#3b2d6e' : c.isNote ? '#2a1f0a' : '#1a1a2e', border: `1px solid ${isMe ? '#7c3aed44' : c.isNote ? '#fa8c1644' : '#2a2a3e'}`, borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px', padding: '10px 12px', fontSize: 13, color: '#e0e0e0', lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'break-word' }}
                    dangerouslySetInnerHTML={{ __html: c.body }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Reply input */}
      <div style={{ background: '#1a1a2e', borderTop: '1px solid #2a2a3e', padding: '10px 14px', flexShrink: 0 }}>
        {!isCustomer && (
          <div style={{ fontSize: 11, color: '#fa8c16', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📝</span> Internal note (agents only)
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={isCustomer ? 'Write a reply...' : 'Write an internal note...'}
            rows={2}
            style={{ flex: 1, background: '#0f1117', border: '1px solid #2a2a3e', borderRadius: 8, padding: '8px 10px', color: '#f0f0f0', fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          />
          <button
            onClick={handleSend}
            disabled={!replyText.trim() || sending}
            style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: replyText.trim() ? '#7c3aed' : '#2a2a3e', border: 'none', cursor: replyText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={replyText.trim() ? '#fff' : '#555'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '10px 14px', borderBottom: last ? 'none' : '1px solid #2a2a3e', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#8c8c8c', width: 72, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#f0f0f0', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{children}</div>
}
