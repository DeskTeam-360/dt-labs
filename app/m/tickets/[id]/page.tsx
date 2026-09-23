'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

import { MOCK_TICKETS, PRIORITY_COLOR } from '../../_mock'

export default function MobileTicketDetail() {
  const { id } = useParams<{ id: string }>()
  const ticket = MOCK_TICKETS.find((t) => t.id === Number(id)) ?? MOCK_TICKETS[0]

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '12px 16px', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <Link href="/m/tickets" style={{ color: '#7c3aed', textDecoration: 'none', fontSize: 20, lineHeight: 1 }}>‹</Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>Ticket #{ticket.id}</div>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Priority + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[ticket.priority], background: `${PRIORITY_COLOR[ticket.priority]}22`, border: `1px solid ${PRIORITY_COLOR[ticket.priority]}44`, borderRadius: 5, padding: '3px 9px' }}>
            {ticket.priority}
          </span>
          <span style={{ fontSize: 11, color: ticket.statusColor, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 8 }}>●</span>
            {ticket.status}
          </span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f0', margin: '0 0 16px', lineHeight: 1.4 }}>{ticket.title}</h1>

        {/* Meta card */}
        <div style={{ background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a3e', overflow: 'hidden', marginBottom: 16 }}>
          <MetaRow label="Company" value={ticket.company} />
          <MetaRow label="Assignee" value={ticket.assignee} />
          <MetaRow label="Created" value={ticket.createdAt} last />
        </div>

        {/* Tags */}
        {ticket.tags.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Tags</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ticket.tags.map((tag) => (
                <span key={tag.label} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 12, background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}>
                  {tag.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Description</div>
          <div style={{ background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a3e', padding: '14px', fontSize: 14, color: '#d0d0d0', lineHeight: 1.6 }}>
            {ticket.description}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '11px 14px', borderBottom: last ? 'none' : '1px solid #2a2a3e' }}>
      <span style={{ fontSize: 12, color: '#8c8c8c', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#f0f0f0', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
