'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import { BottomNav } from '../../_components'
import { MOCK_COMMENTS, MOCK_TICKETS, PRIORITY_COLOR } from '../../_mock'

// Toggle this to simulate customer vs agent view
const IS_CUSTOMER = true

export default function MobileTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const ticket = MOCK_TICKETS.find((t) => t.id === Number(id)) ?? MOCK_TICKETS[0]
  const [replyText, setReplyText] = useState('')
  const [comments, setComments] = useState(MOCK_COMMENTS)
  const [sending, setSending] = useState(false)

  const handleSend = () => {
    if (!replyText.trim()) return
    setSending(true)
    setTimeout(() => {
      setComments((prev) => [...prev, {
        id: Date.now(),
        author: IS_CUSTOMER ? 'Budi Santoso' : 'Asif',
        role: IS_CUSTOMER ? 'customer' : 'agent',
        body: replyText.trim(),
        createdAt: new Date().toLocaleTimeString('id', { hour: '2-digit', minute: '2-digit' }),
        isNote: !IS_CUSTOMER,
      }])
      setReplyText('')
      setSending(false)
    }, 400)
  }

  const visibleComments = IS_CUSTOMER ? comments.filter((c) => !c.isNote) : comments

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '12px 14px', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Link href="/m/tickets" style={{ color: '#7c3aed', textDecoration: 'none', fontSize: 22, lineHeight: 1, marginRight: 2 }}>‹</Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>#{ticket.id}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[ticket.priority], background: `${PRIORITY_COLOR[ticket.priority]}22`, border: `1px solid ${PRIORITY_COLOR[ticket.priority]}44`, borderRadius: 4, padding: '2px 7px' }}>{ticket.priority}</span>
        </div>
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
          <MetaRow label="Status" value={ticket.status} valueColor={ticket.statusColor} />
          <MetaRow label="Company" value={ticket.company} />
          {!IS_CUSTOMER && <MetaRow label="Assignee" value={ticket.assignee} />}
          <MetaRow label="Created" value={ticket.createdAt} last />
        </div>

        {/* Tags */}
        {ticket.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {ticket.tags.map((tag) => (
              <span key={tag.label} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}>
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        <div>
          <SectionLabel>Description</SectionLabel>
          <div style={{ background: '#1a1a2e', borderRadius: 10, border: '1px solid #2a2a3e', padding: '12px 14px', fontSize: 13, color: '#d0d0d0', lineHeight: 1.6 }}>
            {ticket.description}
          </div>
        </div>

        {/* Comments */}
        <div>
          <SectionLabel>Conversation ({visibleComments.length})</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleComments.map((c) => {
              const isMe = (IS_CUSTOMER && c.role === 'customer') || (!IS_CUSTOMER && c.role === 'agent')
              return (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  {/* Author + time */}
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 3, paddingLeft: 4, paddingRight: 4 }}>
                    {c.author} · {c.createdAt}
                    {c.isNote && <span style={{ marginLeft: 6, fontSize: 10, color: '#fa8c16', background: '#fa8c1622', border: '1px solid #fa8c1644', borderRadius: 4, padding: '1px 5px' }}>Note</span>}
                  </div>
                  <div style={{
                    maxWidth: '85%',
                    background: isMe ? '#3b2d6e' : c.isNote ? '#2a1f0a' : '#1a1a2e',
                    border: `1px solid ${isMe ? '#7c3aed44' : c.isNote ? '#fa8c1644' : '#2a2a3e'}`,
                    borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#e0e0e0',
                    lineHeight: 1.5,
                  }}>
                    {c.body}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Reply / Note input */}
      <div style={{ background: '#1a1a2e', borderTop: '1px solid #2a2a3e', padding: '10px 14px', flexShrink: 0 }}>
        {!IS_CUSTOMER && (
          <div style={{ fontSize: 11, color: '#fa8c16', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📝</span> Adding as internal note (visible to agents only)
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={IS_CUSTOMER ? 'Write a reply...' : 'Write an internal note...'}
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

function MetaRow({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '10px 14px', borderBottom: last ? 'none' : '1px solid #2a2a3e', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#8c8c8c', width: 72, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: valueColor ?? '#f0f0f0', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{children}</div>
}
