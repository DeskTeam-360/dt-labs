'use client'

import { Tooltip, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const { Text } = Typography

interface ActiveTrackerEntry {
  user_name: string | null
  start_time: string
  ticket_id?: number | null
  ticket_title?: string | null
}

interface CompanyTodayTotalProps {
  completedSeconds: number
  hasActiveTracker: boolean
  activeTrackerUserName: string | null
  activeTrackerStartTime: string | null
  activeTrackers?: ActiveTrackerEntry[]
}

function fmtTotal(totalSecs: number) {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  return `${h}.${String(m).padStart(2, '0')}H`
}

function fmtElapsed(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`
}

export default function CompanyTodayTotal({
  completedSeconds,
  hasActiveTracker,
  activeTrackers,
  activeTrackerUserName,
  activeTrackerStartTime,
}: CompanyTodayTotalProps) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasActiveTracker) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [hasActiveTracker])

  // Use activeTrackers array if available, fallback to legacy single tracker
  const trackers: ActiveTrackerEntry[] = activeTrackers && activeTrackers.length > 0
    ? activeTrackers
    : (activeTrackerUserName && activeTrackerStartTime
        ? [{ user_name: activeTrackerUserName, start_time: activeTrackerStartTime }]
        : [])

  const totalActiveSecs = trackers.reduce((sum, t) => {
    return sum + Math.floor((now - new Date(t.start_time).getTime()) / 1000)
  }, 0)

  const total = completedSeconds + totalActiveSecs

  return (
    <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: trackers.length > 0 ? 6 : 0 }}>
        <div>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>Today Total</Text>
          <Text style={{ fontSize: 13, fontWeight: 600, color: '#69b1ff', display: 'block', marginTop: 2 }}>
            {fmtTotal(total)}
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: hasActiveTracker ? '#52c41a' : 'rgba(255,255,255,0.2)',
            display: 'inline-block',
            boxShadow: hasActiveTracker ? '0 0 6px #52c41a' : 'none',
          }} />
          <Text style={{ fontSize: 10, color: hasActiveTracker ? '#95de64' : 'rgba(255,255,255,0.3)' }}>
            {hasActiveTracker ? `Active (${trackers.length})` : 'No tracker'}
          </Text>
        </div>
      </div>
      {trackers.map((t, i) => {
        const secs = Math.floor((now - new Date(t.start_time).getTime()) / 1000)
        const clickable = !!t.ticket_id
        return (
          <Tooltip key={i} title={t.ticket_title ?? undefined} placement="left">
            <div
              onClick={clickable ? () => router.push(`/tickets/${t.ticket_id}`) : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 6px',
                background: 'rgba(82,196,26,0.08)', borderRadius: 3,
                borderLeft: '2px solid #52c41a',
                marginTop: i > 0 ? 3 : 0,
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1, marginRight: 6 }}>
                <Text style={{ fontSize: 10, color: '#95de64', fontWeight: 500 }}>{t.user_name ?? '—'}</Text>
                {t.ticket_id && (
                  <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
                    #{t.ticket_id}{t.ticket_title ? ` · ${t.ticket_title.slice(0, 22)}${t.ticket_title.length > 22 ? '…' : ''}` : ''}
                  </Text>
                )}
              </div>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {fmtElapsed(secs)}
              </Text>
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}
