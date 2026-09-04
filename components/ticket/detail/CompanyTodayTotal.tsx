'use client'

import { Typography } from 'antd'
import { useEffect, useState } from 'react'

const { Text } = Typography

interface CompanyTodayTotalProps {
  completedSeconds: number
  hasActiveTracker: boolean
  activeTrackerUserName: string | null
  activeTrackerStartTime: string | null
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
  activeTrackerUserName,
  activeTrackerStartTime,
}: CompanyTodayTotalProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasActiveTracker) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [hasActiveTracker])

  const activeSecs = activeTrackerStartTime
    ? Math.floor((now - new Date(activeTrackerStartTime).getTime()) / 1000)
    : 0
  const total = completedSeconds + activeSecs

  return (
    <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasActiveTracker ? 6 : 0 }}>
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
            {hasActiveTracker ? 'Active' : 'No tracker'}
          </Text>
        </div>
      </div>
      {hasActiveTracker && activeTrackerUserName && activeTrackerStartTime && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(82,196,26,0.08)', borderRadius: 3, borderLeft: '2px solid #52c41a' }}>
          <Text style={{ fontSize: 10, color: '#95de64', fontWeight: 500 }}>{activeTrackerUserName}</Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtElapsed(activeSecs)}
          </Text>
        </div>
      )}
    </div>
  )
}
