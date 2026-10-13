'use client'

import { ClockCircleOutlined } from '@ant-design/icons'
import { Card, DatePicker, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  buildHourlyActivity,
  type StoppedTimeSession,
} from '@/lib/dashboard-hourly-activity'

dayjs.extend(utc)
dayjs.extend(timezone)

const { Text } = Typography

/** Ticks on the browser clock only (no server calls); isolated so only this span re-renders. */
function TzClock({ tz }: { tz: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dayjs(now).tz(tz).format('HH:mm:ss')}</span>
}

export default function DashboardHourlyActivityCard({
  stoppedSessions,
  activeSessions,
  timezone: tzProp,
  style,
}: {
  stoppedSessions: StoppedTimeSession[]
  activeSessions: Array<{ ticket_id: number; start_time: string }>
  /** IANA zone the hours are cut in (profile timezone); defaults to the browser zone. */
  timezone?: string | null
  style?: React.CSSProperties
}) {
  const tz = useMemo(() => {
    const candidate = tzProp?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate })
      return candidate
    } catch {
      return 'UTC'
    }
  }, [tzProp])
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [hourlyTick, setHourlyTick] = useState(0)

  const todayStr = dayjs().tz(tz).format('YYYY-MM-DD')
  const dayStr = pickedDay ?? todayStr

  useEffect(() => {
    if (dayStr !== todayStr) return
    const id = window.setInterval(() => setHourlyTick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [dayStr, todayStr])

  const hourlyChartData = useMemo(
    () => buildHourlyActivity(dayStr, tz, stoppedSessions, activeSessions),
    [dayStr, tz, stoppedSessions, activeSessions, hourlyTick]
  )

  return (
    <Card
      style={{ marginTop: 16, ...style }}
      title={
        <Space wrap>
          <ClockCircleOutlined />
          <span>My Daily activity by hour</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            {tz} · <TzClock tz={tz} />
          </Text>
        </Space>
      }
      extra={
        <DatePicker
          value={dayjs(dayStr)}
          onChange={(d) => d && setPickedDay(d.format('YYYY-MM-DD'))}
          allowClear={false}
          disabledDate={(current) =>
            !!current &&
            (current.format('YYYY-MM-DD') > todayStr ||
              current.format('YYYY-MM-DD') < dayjs(todayStr).subtract(30, 'day').format('YYYY-MM-DD'))
          }
        />
      }
    >
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={hourlyChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={1}
              angle={-45}
              textAnchor="end"
              height={56}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              label={{ value: 'Tickets', angle: 90, position: 'insideRight' }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const minutes = Number(payload.find((p) => p.dataKey === 'minutes')?.value ?? 0)
                const tickets = Number(payload.find((p) => p.dataKey === 'tickets')?.value ?? 0)
                return (
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #f0f0f0',
                      borderRadius: 4,
                      padding: '8px 12px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#141414' }}>Hour {label}</div>
                    <div style={{ fontSize: 12, color: '#1890ff' }}>{minutes} min — time in this hour</div>
                    <div style={{ fontSize: 12, color: '#fa8c16' }}>
                      {tickets} distinct ticket{tickets === 1 ? '' : 's'} overlapping
                    </div>
                  </div>
                )
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="minutes" name="Minutes" fill="#1890ff" radius={[2, 2, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="tickets"
              name="Tickets"
              stroke="#fa8c16"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
