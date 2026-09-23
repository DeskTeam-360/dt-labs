'use client'

import Link from 'next/link'
import { useState } from 'react'

import { MOCK_TICKETS, PRIORITY_COLOR } from '../_mock'
import { BottomNav } from '../dashboard/page'

const STATUS_FILTERS = ['All', 'Open', 'In Progress', 'Resolved']

export default function MobileTickets() {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const tickets = MOCK_TICKETS.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || String(t.id).includes(search)
    return matchSearch
  })

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '16px 16px 12px', borderBottom: '1px solid #2a2a3e', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>My Tickets</div>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or title..."
            style={{ width: '100%', background: '#0f1117', border: '1px solid #2a2a3e', borderRadius: 8, padding: '9px 12px 9px 36px', color: '#f0f0f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8c8c8c', fontSize: 14 }}>🔍</span>
        </div>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ flexShrink: 0, padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: filter === f ? '#7c3aed' : '#2a2a3e', color: filter === f ? '#fff' : '#8c8c8c' }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket list */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tickets.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8c8c8c', padding: '40px 0', fontSize: 14 }}>No tickets found</div>
        )}
        {tickets.map((t) => (
          <Link key={t.id} href={`/m/tickets/${t.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '14px', border: '1px solid #2a2a3e', activeOpacity: 0.7 }}>
              {/* Top row: priority + id */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[t.priority], background: `${PRIORITY_COLOR[t.priority]}22`, border: `1px solid ${PRIORITY_COLOR[t.priority]}44`, borderRadius: 4, padding: '2px 7px' }}>
                  {t.priority}
                </span>
                <span style={{ fontSize: 11, color: '#8c8c8c' }}>#{t.id}</span>
                <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 'auto' }}>{t.createdAt}</span>
              </div>

              {/* Title */}
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f0', lineHeight: 1.4, marginBottom: 8 }}>{t.title}</div>

              {/* Company */}
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: t.tags.length ? 8 : 0 }}>🏢 {t.company}</div>

              {/* Tags */}
              {t.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {t.tags.map((tag) => (
                    <span key={tag.label} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${tag.color}22`, color: tag.color, border: `1px solid ${tag.color}44` }}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 8, color: t.statusColor }}>●</span>
                <span style={{ fontSize: 12, color: t.statusColor }}>{t.status}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <BottomNav active="tickets" />
    </div>
  )
}
