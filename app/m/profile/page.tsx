'use client'

import { BottomNav } from '../_components'

const MOCK_USER = {
  name: 'Budi Santoso',
  email: 'budi@prodevcom.id',
  company: 'Prodev Com',
  role: 'Customer',
  initials: 'BS',
}

export default function MobileProfile() {
  return (
    <div style={{ paddingBottom: 70 }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '14px 14px 12px', borderBottom: '1px solid #2a2a3e' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Profile</div>
      </div>

      <div style={{ padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Avatar + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0 8px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#fff' }}>
            {MOCK_USER.initials}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f0' }}>{MOCK_USER.name}</div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 2 }}>{MOCK_USER.email}</div>
          </div>
        </div>

        {/* Info card */}
        <div style={{ background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a3e', overflow: 'hidden' }}>
          <InfoRow label="Company" value={MOCK_USER.company} />
          <InfoRow label="Role" value={MOCK_USER.role} last />
        </div>

        {/* Actions */}
        <div style={{ background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a3e', overflow: 'hidden' }}>
          <ActionRow label="Notifications" icon="🔔" />
          <ActionRow label="Change Password" icon="🔑" />
          <ActionRow label="Help & Support" icon="💬" last />
        </div>

        {/* Logout */}
        <button
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1px solid #ff4d4f44', background: '#ff4d4f11', color: '#ff4d4f', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          onClick={() => alert('Logout (dummy)')}
        >
          Sign Out
        </button>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#555' }}>DeskTeam360 · v1.0</div>
      </div>

      <BottomNav />
    </div>
  )
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '11px 14px', borderBottom: last ? 'none' : '1px solid #2a2a3e', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#8c8c8c', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#f0f0f0', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function ActionRow({ label, icon, last }: { label: string; icon: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '13px 14px', borderBottom: last ? 'none' : '1px solid #2a2a3e', alignItems: 'center', cursor: 'pointer' }}>
      <span style={{ fontSize: 16, marginRight: 12 }}>{icon}</span>
      <span style={{ fontSize: 14, color: '#f0f0f0', flex: 1 }}>{label}</span>
      <span style={{ color: '#555', fontSize: 16 }}>›</span>
    </div>
  )
}
