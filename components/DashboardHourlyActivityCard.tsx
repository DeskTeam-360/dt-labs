'use client'

import { Card, DatePicker, Space, Typography } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  buildHourlyActivity,
  type StoppedTimeSession,
} from '@/lib/dashboard-hourly-activity'
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

const { Text } = Typography

export default function DashboardHourlyActivityCard({
  stoppedSessions,
  activeSessions,
  style,
}: {
  stoppedSessions: StoppedTimeSession[]
  activeSessions: Array<{ ticket_id: number; start_time: string }>
  style?: React.CSSProperties
}) {
  const [hourlyDay, setHourlyDay] = useState(() => dayjs())
  const [hourlyTick, setHourlyTick] = useState(0)

  useEffect(() => {
    if (!hourlyDay.isSame(dayjs(), 'day')) return
    const id = window.setInterval(() => setHourlyTick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [hourlyDay])

  const hourlyChartData = useMemo(
    () => buildHourlyActivity(hourlyDay, stoppedSessions, activeSessions),
    [hourlyDay, stoppedSessions, activeSessions, hourlyTick]
  )

  return (
    <Card
      style={{ marginTop: 16, ...style }}
      title={
        <Space wrap>
          <ClockCircleOutlined />
          <span>Daily activity by hour</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            Minutes worked vs distinct tickets overlapping each hour (local time)
          </Text>
        </Space>
      }
      extra={
        <DatePicker
          value={hourlyDay}
          onChange={(d) => d && setHourlyDay(d.startOf('day'))}
          allowClear={false}
          disabledDate={(current) =>
            !!current &&
            (current.isAfter(dayjs().endOf('day')) ||
              current.isBefore(dayjs().subtract(30, 'day').startOf('day')))
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
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Hour {label}</div>
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
