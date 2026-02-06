'use client'

import {
  Layout,
  Card,
  Typography,
  Button,
  Space,
  Tag,
  List,
  Avatar,
  Segmented,
  DatePicker,
  Table,
  Spin,
  Empty,
  Row,
  Col,
  Statistic,
  Tabs,
} from 'antd'
import {
  ArrowLeftOutlined,
  TeamOutlined,
  BarChartOutlined,
  UserOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import dayjs, { Dayjs } from 'dayjs'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import { createClient } from '@/utils/supabase/client'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

type ReportPeriod = 'week' | 'month' | 'custom'

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
  joined_at: string
  user_name?: string
  user_email?: string
}

interface TeamData {
  id: string
  name: string
  type: string | null
  created_by: string
  created_at: string
  creator_name?: string
  members: TeamMember[]
}

interface ReportRow {
  id: string
  user_id: string
  user_name: string
  user_email?: string
  todo_id: number
  ticket_title?: string
  start_time: string
  stop_time: string | null
  duration_seconds: number | null
}

interface TeamDetailContentProps {
  user: User
  team: TeamData
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function TeamDetailContent({ user: currentUser, team }: TeamDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('week')
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [reportSessions, setReportSessions] = useState<ReportRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const supabase = createClient()

  const memberUserIds = useMemo(() => team.members.map((m) => m.user_id), [team.members])

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = dayjs()
    if (reportPeriod === 'week') {
      return {
        rangeStart: now.subtract(7, 'day').startOf('day'),
        rangeEnd: now.endOf('day'),
      }
    }
    if (reportPeriod === 'month') {
      return {
        rangeStart: now.subtract(30, 'day').startOf('day'),
        rangeEnd: now.endOf('day'),
      }
    }
    if (reportPeriod === 'custom' && customRange?.[0] && customRange?.[1]) {
      return {
        rangeStart: customRange[0].startOf('day'),
        rangeEnd: customRange[1].endOf('day'),
      }
    }
    return { rangeStart: null, rangeEnd: null }
  }, [reportPeriod, customRange])

  const fetchReport = async () => {
    if (memberUserIds.length === 0 || !rangeStart || !rangeEnd) {
      setReportSessions([])
      return
    }
    setReportLoading(true)
    try {
      const startIso = rangeStart.toISOString()
      const endIso = rangeEnd.toISOString()

      const { data, error } = await supabase
        .from('todo_time_tracker')
        .select(`
          id,
          user_id,
          todo_id,
          start_time,
          stop_time,
          duration_seconds,
          ticket:tickets(id, title),
          user:users!todo_time_tracker_user_id_fkey(id, full_name, email)
        `)
        .in('user_id', memberUserIds)
        .gte('start_time', startIso)
        .lte('start_time', endIso)
        .order('start_time', { ascending: false })

      if (error) throw error

      const rows: ReportRow[] = (data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.user?.full_name || r.user?.email || 'Unknown',
        user_email: r.user?.email,
        todo_id: r.todo_id,
        ticket_title: r.ticket?.title,
        start_time: r.start_time,
        stop_time: r.stop_time,
        duration_seconds: r.duration_seconds,
      }))
      setReportSessions(rows)
    } catch {
      setReportSessions([])
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    if (rangeStart && rangeEnd) fetchReport()
    else if (!rangeStart && !rangeEnd && memberUserIds.length > 0) setReportSessions([])
  }, [reportPeriod, customRange, memberUserIds.length, rangeStart?.toISOString(), rangeEnd?.toISOString()])

  const reportColumns: ColumnsType<ReportRow> = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <div>
            <div>{r.user_name}</div>
            {r.user_email && <Text type="secondary" style={{ fontSize: 12 }}>{r.user_email}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_, r) => (
        <Space>
          <Text strong>#{r.todo_id}</Text>
          {r.ticket_title ? r.ticket_title : '-'}
        </Space>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration_seconds',
      key: 'duration',
      render: (v: number | null) => formatDuration(v),
    },
    {
      title: 'Start',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (d: string) => <DateDisplay date={d} format="detailed" />,
    },
    {
      title: 'Stop',
      dataIndex: 'stop_time',
      key: 'stop_time',
      render: (d: string | null) => (d ? <DateDisplay date={d} format="detailed" /> : '-'),
    },
  ]

  const summaryByUser = useMemo(() => {
    const map: Record<string, { name: string; seconds: number; tickets: Set<number> }> = {}
    reportSessions.forEach((s) => {
      if (!map[s.user_id]) {
        map[s.user_id] = { name: s.user_name, seconds: 0, tickets: new Set() }
      }
      map[s.user_id].seconds += s.duration_seconds ?? 0
      map[s.user_id].tickets.add(s.todo_id)
    })
    return Object.entries(map).map(([userId, v]) => ({
      user_id: userId,
      name: v.name,
      totalSeconds: v.seconds,
      ticketCount: v.tickets.size,
    }))
  }, [reportSessions])

  const totalSeconds = reportSessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)

  const tabItems = [
  {
    key: 'info',
    label: (
      <span>
        <InfoCircleOutlined />
        Info
      </span>
    ),
    children: (
      <Card>
        <Title level={5} style={{ marginTop: 0 }}>Team Information</Title>
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Text type="secondary">Name</Text>
            <div><Text strong>{team.name}</Text></div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Type</Text>
            <div>{team.type ? <Tag>{team.type}</Tag> : '-'}</div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Created by</Text>
            <div>{team.creator_name}</div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Created at</Text>
            <div><DateDisplay date={team.created_at} format="detailed" /></div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Member count</Text>
            <div>{team.members.length} members</div>
          </Col>
        </Row>
      </Card>
    ),
  },
  {
    key: 'members',
    label: (
      <span>
        <TeamOutlined />
        Team Members ({team.members.length})
      </span>
    ),
    children: (
      <Card>
        {team.members.length === 0 ? (
          <Empty description="No members yet" />
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={team.members}
            renderItem={(m) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} />}
                  title={
                    <Space>
                      {m.user_name}
                      <Tag>{m.role}</Tag>
                    </Space>
                  }
                  description={m.user_email}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    ),
  },
  {
    key: 'report',
    label: (
      <span>
        <BarChartOutlined />
        Report
      </span>
    ),
    children: (
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={16} align="middle">
            <Col>
              <Segmented
                value={reportPeriod}
                onChange={(v) => setReportPeriod(v as ReportPeriod)}
                options={[
                  { label: 'This week', value: 'week' },
                  { label: 'This month', value: 'month' },
                  { label: 'Custom', value: 'custom' },
                ]}
              />
            </Col>
            {reportPeriod === 'custom' && (
              <Col>
                <RangePicker
                  value={customRange}
                  onChange={(dates) => setCustomRange(dates as [Dayjs, Dayjs] | null)}
                />
                {!customRange && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Select date range to view report
                  </Text>
                )}
              </Col>
            )}
          </Row>

          {rangeStart && rangeEnd && (
            <Row gutter={24}>
              <Col>
                <Statistic
                  title="Total time"
                  value={Math.round(totalSeconds / 60)}
                  suffix="min"
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col>
                <Statistic title="Sessions" value={reportSessions.length} />
              </Col>
            </Row>
          )}

          {summaryByUser.length > 0 && (
            <div>
              <Text strong>Summary by user</Text>
              <Row gutter={16} style={{ marginTop: 8 }}>
                {summaryByUser.map((u) => (
                  <Col key={u.user_id} span={8}>
                    <Card size="small">
                      <Statistic
                        title={u.name}
                        value={Math.round(u.totalSeconds / 60)}
                        suffix="min"
                      />
                      <Text type="secondary">{u.ticketCount} ticket</Text>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}

          <Spin spinning={reportLoading}>
            <Table
              size="small"
              columns={reportColumns}
              dataSource={reportSessions}
              rowKey="id"
              pagination={{ pageSize: 10, showTotal: (t) => `Total ${t} sessions` }}
              locale={{ emptyText: 'No time tracker data for this period' }}
            />
          </Spin>
        </Space>
      </Card>
    ),
  },
]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Space align="center" style={{ marginBottom: 16 }}>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/teams')}>
                Back
              </Button>
            </Space>
            <Title level={3} style={{ marginTop: 0 }}>
              {team.name}
            </Title>
            {team.type && <Tag>{team.type}</Tag>}
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <Text type="secondary">
                Created by {team.creator_name} · <DateDisplay date={team.created_at} />
              </Text>
            </div>
            <Tabs defaultActiveKey="info" items={tabItems} />
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}
