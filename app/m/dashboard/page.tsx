'use client'

import Link from 'next/link'

import { MOCK_STATS, MOCK_TICKETS, PRIORITY_COLOR } from '../_mock'

export default function MobileDashboard() {
  const recent = MOCK_TICKETS.slice(0, 3)

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '16px 16px 12px', borderBottom: '1px solid #2a2a3e' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 1 }}>DeskTeam360</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>Dashboard</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
            A
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <StatCard label="Open" value={MOCK_STATS.open} color="#ff4d4f" />
          <StatCard label="In Progress" value={MOCK_STATS.inProgress} color="#fa8c16" />
          <StatCard label="Resolved" value={MOCK_STATS.resolved} color="#52c41a" />
          <StatCard label="Avg Response" value={MOCK_STATS.avgResponse} color="#7c3aed" isText />
        </div>
      </div>

      {/* Recent Tickets */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Recent Tickets</div>
          <Link href="/m/tickets" style={{ fontSize: 12, color: '#7c3aed', textDecoration: 'none' }}>See all →</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recent.map((t) => (
            <Link key={t.id} href={`/m/tickets/${t.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '12px 14px', border: '1px solid #2a2a3e' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[t.priority], background: `${PRIORITY_COLOR[t.priority]}22`, border: `1px solid ${PRIORITY_COLOR[t.priority]}44`, borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 1 }}>{t.priority}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>#{t.id} · {t.company}</div>
                  </div>
                  <span style={{ fontSize: 10, color: t.statusColor, flexShrink: 0 }}>●</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom Nav */}
      <BottomNav active="dashboard" />
    </div>
  )
}

function StatCard({ label, value, color, isText }: { label: string; value: string | number; color: string; isText?: boolean }) {
  return (
    <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '14px 16px', border: '1px solid #2a2a3e' }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: isText ? 20 : 28, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

export function BottomNav({ active }: { active: 'dashboard' | 'tickets' }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', href: '/m/dashboard', icon: '◫' },
    { key: 'tickets', label: 'Tickets', href: '/m/tickets', icon: '🎫' },
  ]
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1a1a2e', borderTop: '1px solid #2a2a3e', display: 'flex', zIndex: 100 }}>
      {items.map((item) => (
        <Link key={item.key} href={item.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0 14px', textDecoration: 'none', color: active === item.key ? '#7c3aed' : '#8c8c8c', borderTop: active === item.key ? '2px solid #7c3aed' : '2px solid transparent' }}>
          <span style={{ fontSize: 20 }}>{item.icon}</span>
          <span style={{ fontSize: 10, marginTop: 2, fontWeight: active === item.key ? 600 : 400 }}>{item.label}</span>
        </Link>
      ))}
    </div>
  )
}
