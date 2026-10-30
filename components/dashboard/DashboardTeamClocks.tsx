'use client'

import { GlobalOutlined } from '@ant-design/icons'
import { Card, Flex, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'

import { TIMEZONE_OPTIONS } from '@/lib/timezones'

const { Text } = Typography

type ServerClock = { offsetMs: number; timezone: string }

/** The place name and zone abbreviation of an option label, e.g. "Malang, Indonesia" and "WIB (UTC+7)". */
const splitLabel = (label: string) => {
  const [place, zone] = label.split(' - ')
  return { place, zone: zone ?? '' }
}

/** Live clocks for the places the team works from (the time zones of the profile page), and the server's own time. */
export default function DashboardTeamClocks({ myTimezone }: { myTimezone?: string }) {
  const [now, setNow] = useState(() => Date.now())
  const [server, setServer] = useState<ServerClock | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const asked = Date.now()
    fetch('/api/server-time', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { now: string; timezone: string } | null) => {
        if (!j) return
        // The server's clock may differ from this computer's, so keep the difference (half the round trip counted in).
        const rtt = Date.now() - asked
        setServer({ offsetMs: new Date(j.now).getTime() + rtt / 2 - Date.now(), timezone: j.timezone })
      })
      .catch(() => {})
  }, [])

  const time = (ms: number, timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms)
  const day = (ms: number, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(ms)

  const rows = [
    ...TIMEZONE_OPTIONS.map((o) => ({ key: o.value, tz: o.value, ...splitLabel(o.label), mine: o.value === myTimezone })),
    ...(server ? [{ key: 'server', tz: server.timezone, place: 'Server', zone: server.timezone, mine: false, ms: now + server.offsetMs }] : []),
  ]

  return (
    <Card
      title={
        <Flex gap={8} align="center">
          <GlobalOutlined />
          <span>Team clocks</span>
        </Flex>
      }
    >
      <Flex vertical gap={10}>
        {rows.map((r) => {
          const ms = 'ms' in r ? r.ms : now
          return (
            <Flex key={r.key} justify="space-between" align="center" gap={12}>
              <div>
                <Text strong>{r.place}</Text>
                {r.mine ? <Tag color="blue" style={{ marginLeft: 8 }}>You</Tag> : null}
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{r.zone}</Text>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Text strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{time(ms, r.tz)}</Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{day(ms, r.tz)}</Text>
                </div>
              </div>
            </Flex>
          )
        })}
      </Flex>
    </Card>
  )
}
