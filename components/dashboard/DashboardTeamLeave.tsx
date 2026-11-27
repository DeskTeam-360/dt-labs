'use client'

import { CalendarOutlined } from '@ant-design/icons'
import { Card, Empty, Flex, List, Tag, Typography } from 'antd'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const { Text } = Typography

type Leave = { id: string; user_id: string; name: string; start_date: string; end_date: string; title: string; days: number; starts_in: number }

const fmt = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Who is on leave today or in the next two weeks, from the team calendar. Shown to the team only. */
export default function DashboardTeamLeave() {
  const [rows, setRows] = useState<Leave[] | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/team-leave', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data?: Leave[] }) => setRows(j.data ?? []))
      .catch(() => setRows([]))
  }, [])

  if (rows === null) return null

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={<span><CalendarOutlined /> Team on leave, next 2 weeks ({rows.length})</span>}
      extra={<Link href="/calendar">Open calendar</Link>}
    >
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nobody is on leave in the next two weeks" />
      ) : (
        <List
          size="small"
          dataSource={rows}
          renderItem={(r) => {
            const now = r.starts_in <= 0
            return (
              <List.Item>
                <Flex justify="space-between" align="center" gap={12} wrap style={{ width: '100%' }}>
                  <Flex vertical>
                    <Text strong>{r.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {r.start_date === r.end_date ? fmt(r.start_date) : `${fmt(r.start_date)} - ${fmt(r.end_date)}`} · {r.days} day{r.days > 1 ? 's' : ''}
                    </Text>
                  </Flex>
                  <Tag color={now ? 'orange' : 'default'} style={{ margin: 0 }}>
                    {now ? 'On leave now' : r.starts_in === 1 ? 'Starts tomorrow' : `In ${r.starts_in} days`}
                  </Tag>
                </Flex>
              </List.Item>
            )
          }}
        />
      )}
    </Card>
  )
}
