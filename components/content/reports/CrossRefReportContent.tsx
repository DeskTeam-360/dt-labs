'use client'

import {
  BarChartOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Empty,
  Layout,
  Progress,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useRef, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

type ViewBy = 'customer' | 'user' | 'team'

type UserBreakdown = {
  id: string
  name: string
  seconds: number
  ticket_count: number
}

type CustomerRow = {
  company_id: string
  company_name: string
  company_color: string | null
  ticket_count: number
  total_seconds: number
  users: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  user_breakdown: UserBreakdown[]
}

type UserRow = {
  user_id: string
  user_name: string
  ticket_count: number
  total_seconds: number
  customers: { id: string; name: string; ticket_count: number; seconds: number }[]
}

type TeamRow = {
  team_id: string
  team_name: string
  ticket_count: number
  total_seconds: number
  customers: { id: string; name: string; ticket_count: number }[]
  members: { id: string; name: string }[]
}

type ReportData =
  | { view_by: 'customer'; rows: CustomerRow[] }
  | { view_by: 'user'; rows: UserRow[] }
  | { view_by: 'team'; rows: TeamRow[] }

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function CrossRefReportContent({ user: currentUser }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs(),
  ])
  const [viewBy, setViewBy] = useState<ViewBy>('customer')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ReportData | null>(null)
  /** Once a report has been run, changing View by re-fetches with the same date range. */
  const hasRunRef = useRef(false)

  const fetchReport = useCallback(async (nextViewBy: ViewBy, range: [Dayjs, Dayjs]) => {
    if (!range[0] || !range[1]) return
    setLoading(true)
    try {
      const from = range[0].startOf('day').toISOString()
      const to = range[1].endOf('day').toISOString()
      const res = await fetch(
        `/api/reports/cross-ref?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}&view_by=${nextViewBy}`,
        { credentials: 'include' }
      )
      const json = await res.json()
      if (res.ok) {
        setData(json as ReportData)
        hasRunRef.current = true
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRun = () => {
    void fetchReport(viewBy, dateRange)
  }

  const handleViewByChange = (next: ViewBy) => {
    setViewBy(next)
    // Keep existing results visible; switch perspective for the last-run date range.
    if (hasRunRef.current) {
      void fetchReport(next, dateRange)
    }
  }

  // ── Customer columns ──
  const customerColumns: ColumnsType<CustomerRow> = [
    {
      title: '#',
      key: 'no',
      width: 48,
      render: (_, __, i) => <Text type="secondary">{i + 1}</Text>,
    },
    {
      title: 'Customer',
      key: 'name',
      render: (_, r) => (
        <Tag
          style={{
            backgroundColor: r.company_color ?? undefined,
            borderColor: r.company_color ?? undefined,
            color: r.company_color ? '#fff' : undefined,
          }}
        >
          {r.company_name}
        </Tag>
      ),
    },
    {
      title: 'Tickets',
      dataIndex: 'ticket_count',
      key: 'tickets',
      width: 90,
      align: 'right',
      render: (v: number) => <Badge count={v} color="#1677ff" overflowCount={9999} />,
    },
    {
      title: 'Time tracked',
      dataIndex: 'total_seconds',
      key: 'time',
      width: 120,
      align: 'right',
      render: (v: number) => (
        <Text>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {formatDuration(v)}
        </Text>
      ),
    },
    {
      title: 'Users',
      key: 'users',
      render: (_, r) =>
        r.users.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space size={4} wrap>
            {r.users.map((u) => (
              <Tag key={u.id} icon={<UserOutlined />}>
                {u.name}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Teams',
      key: 'teams',
      render: (_, r) =>
        r.teams.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space size={4} wrap>
            {r.teams.map((t) => (
              <Tag key={t.id} icon={<TeamOutlined />} color="purple">
                {t.name}
              </Tag>
            ))}
          </Space>
        ),
    },
  ]

  // ── User columns ──
  const userColumns: ColumnsType<UserRow> = [
    {
      title: '#',
      key: 'no',
      width: 48,
      render: (_, __, i) => <Text type="secondary">{i + 1}</Text>,
    },
    {
      title: 'User',
      dataIndex: 'user_name',
      key: 'name',
      render: (v: string) => (
        <Space>
          <UserOutlined />
          <Text strong>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Tickets',
      dataIndex: 'ticket_count',
      key: 'tickets',
      width: 90,
      align: 'right',
      render: (v: number) => <Badge count={v} color="#1677ff" overflowCount={9999} />,
    },
    {
      title: 'Time tracked',
      dataIndex: 'total_seconds',
      key: 'time',
      width: 120,
      align: 'right',
      render: (v: number) => (
        <Text>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {formatDuration(v)}
        </Text>
      ),
    },
    {
      title: 'Customers worked on',
      key: 'customers',
      render: (_, r) =>
        r.customers.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Text type="secondary">{r.customers.length} customer(s) — click to expand</Text>
        ),
    },
  ]

  // ── Team columns ──
  const teamColumns: ColumnsType<TeamRow> = [
    {
      title: '#',
      key: 'no',
      width: 48,
      render: (_, __, i) => <Text type="secondary">{i + 1}</Text>,
    },
    {
      title: 'Team',
      dataIndex: 'team_name',
      key: 'name',
      render: (v: string) => (
        <Space>
          <TeamOutlined />
          <Text strong>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Tickets',
      dataIndex: 'ticket_count',
      key: 'tickets',
      width: 90,
      align: 'right',
      render: (v: number) => <Badge count={v} color="#1677ff" overflowCount={9999} />,
    },
    {
      title: 'Time tracked',
      dataIndex: 'total_seconds',
      key: 'time',
      width: 120,
      align: 'right',
      render: (v: number) => (
        <Text>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {formatDuration(v)}
        </Text>
      ),
    },
    {
      title: 'Members',
      key: 'members',
      width: 220,
      render: (_, r) =>
        r.members.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space size={4} wrap>
            {r.members.map((m) => (
              <Tag key={m.id} icon={<UserOutlined />}>
                {m.name}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Customers handled',
      key: 'customers',
      render: (_, r) =>
        r.customers.length === 0 ? (
          <Text type="secondary">—</Text>
        ) : (
          <Collapse
            ghost
            size="small"
            items={[
              {
                key: '1',
                label: <Text type="secondary">{r.customers.length} customer(s)</Text>,
                children: (
                  <Space size={4} wrap>
                    {r.customers.map((c) => (
                      <Tag key={c.id}>
                        {c.name} <Text type="secondary">({c.ticket_count})</Text>
                      </Tag>
                    ))}
                  </Space>
                ),
              },
            ]}
          />
        ),
    },
  ]

  // ── Summary stats ──
  const summaryStats = (() => {
    if (!data) return null
    if (data.view_by === 'customer') {
      const totalTickets = data.rows.reduce((a, r) => a + r.ticket_count, 0)
      const totalSec = data.rows.reduce((a, r) => a + r.total_seconds, 0)
      const totalCustomers = data.rows.length
      return { totalTickets, totalSec, label1: 'Customers', count1: totalCustomers }
    }
    if (data.view_by === 'user') {
      const totalTickets = data.rows.reduce((a, r) => a + r.ticket_count, 0)
      const totalSec = data.rows.reduce((a, r) => a + r.total_seconds, 0)
      return { totalTickets, totalSec, label1: 'Users', count1: data.rows.length }
    }
    if (data.view_by === 'team') {
      const totalTickets = data.rows.reduce((a, r) => a + r.ticket_count, 0)
      const totalSec = data.rows.reduce((a, r) => a + r.total_seconds, 0)
      return { totalTickets, totalSec, label1: 'Teams', count1: data.rows.length }
    }
    return null
  })()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div style={{ marginBottom: 20 }}>
            <Title level={2} className="settings-section-heading" style={{ margin: 0, fontSize: '1.5rem' }}>
              <BarChartOutlined style={{ marginRight: 10 }} />
              Cross Reference Report
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Analyze tickets, time, customers, users, and teams within a selected date range.
            </Text>
          </div>

          {/* ── Filter bar ── */}
          <Card size="small" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Date range */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 11, lineHeight: 1 }}>
                  Date range <Text type="danger">*</Text>
                </Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(dates) => {
                      if (dates?.[0]?.isValid() && dates?.[1]?.isValid()) {
                        setDateRange([dates[0], dates[1]])
                      }
                    }}
                    allowClear={false}
                    format="YYYY-MM-DD"
                    disabledDate={(d) => d.isAfter(dayjs())}
                  />
                  <Space size={0}>
                    {[
                      { label: 'This week', from: dayjs().startOf('week'), to: dayjs() },
                      { label: 'This month', from: dayjs().startOf('month'), to: dayjs() },
                      { label: 'Last month', from: dayjs().subtract(1, 'month').startOf('month'), to: dayjs().subtract(1, 'month').endOf('month') },
                      { label: 'This year', from: dayjs().startOf('year'), to: dayjs() },
                    ].map((s, i, arr) => (
                      <span key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: '0 6px', fontSize: 12 }}
                          onClick={() => setDateRange([s.from, s.to])}
                        >
                          {s.label}
                        </Button>
                        {i < arr.length - 1 && <Text type="secondary" style={{ fontSize: 11 }}>·</Text>}
                      </span>
                    ))}
                  </Space>
                </div>
              </div>

              {/* View by + Run button group */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11, lineHeight: 1 }}>View by</Text>
                  <Segmented
                    value={viewBy}
                    onChange={(v) => handleViewByChange(v as ViewBy)}
                    options={[
                      { label: 'Customer', value: 'customer', icon: <FileTextOutlined /> },
                      { label: 'User', value: 'user', icon: <UserOutlined /> },
                      { label: 'Team', value: 'team', icon: <TeamOutlined /> },
                    ]}
                  />
                </div>
                <Button type="primary" onClick={handleRun} loading={loading}>
                  Run Report
                </Button>
              </div>
            </div>
          </Card>

          {/* ── Results ── */}
          <Spin spinning={loading}>
            {!data && !loading && (
              <Empty description="Select a date range and view by, then click Run Report" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}

            {data && summaryStats && (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={8}>
                    <Card size="small">
                      <Statistic title={summaryStats.label1} value={summaryStats.count1} />
                    </Card>
                  </Col>
                  <Col xs={8}>
                    <Card size="small">
                      <Statistic title="Total Tickets" value={summaryStats.totalTickets} prefix={<FileTextOutlined />} />
                    </Card>
                  </Col>
                  <Col xs={8}>
                    <Card size="small">
                      <Statistic
                        title="Total Time Tracked"
                        value={formatDuration(summaryStats.totalSec)}
                        prefix={<ClockCircleOutlined />}
                      />
                    </Card>
                  </Col>
                </Row>

                {data.view_by === 'customer' && (
                  <Table<CustomerRow>
                    rowKey="company_id"
                    columns={customerColumns}
                    dataSource={data.rows}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} customers` }}
                    locale={{ emptyText: 'No data' }}
                    expandable={{
                      expandRowByClick: true,
                      rowExpandable: (r) => r.user_breakdown.length > 0,
                      expandedRowRender: (r) => {
                        const maxSec = Math.max(...r.user_breakdown.map((u) => u.seconds), 1)
                        return (
                          <div style={{ padding: '8px 16px 16px' }}>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
                              Time distribution per user — {r.company_name}
                            </Text>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {r.user_breakdown.map((u) => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ width: 160, flexShrink: 0 }}>
                                    <Text strong style={{ fontSize: 13 }}>{u.name}</Text>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <Tooltip title={`${formatDuration(u.seconds)} · ${u.ticket_count} ticket`}>
                                      <Progress
                                        percent={Math.round((u.seconds / maxSec) * 100)}
                                        format={() => (
                                          <span style={{ fontSize: 12 }}>
                                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                                            {formatDuration(u.seconds)}
                                            <Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                                              ({u.ticket_count} tickets)
                                            </Text>
                                          </span>
                                        )}
                                        strokeColor="#9155FD"
                                        size="small"
                                      />
                                    </Tooltip>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      },
                    }}
                  />
                )}

                {data.view_by === 'user' && (
                  <Table<UserRow>
                    rowKey="user_id"
                    columns={userColumns}
                    dataSource={data.rows}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} users` }}
                    locale={{ emptyText: 'No data' }}
                    expandable={{
                      expandRowByClick: true,
                      rowExpandable: (r) => r.customers.length > 0,
                      expandedRowRender: (r) => {
                        const maxSec = Math.max(...r.customers.map((c) => c.seconds), 1)
                        return (
                          <div style={{ padding: '8px 16px 16px' }}>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
                              Time distribution per customer — {r.user_name}
                            </Text>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {r.customers.map((c) => (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ width: 160, flexShrink: 0 }}>
                                    <Text strong style={{ fontSize: 13 }}>{c.name}</Text>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <Tooltip title={`${formatDuration(c.seconds)} · ${c.ticket_count} ticket`}>
                                      <Progress
                                        percent={Math.round((c.seconds / maxSec) * 100)}
                                        format={() => (
                                          <span style={{ fontSize: 12 }}>
                                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                                            {formatDuration(c.seconds)}
                                            <Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                                              ({c.ticket_count} tickets)
                                            </Text>
                                          </span>
                                        )}
                                        strokeColor="#01C4C4"
                                        size="small"
                                      />
                                    </Tooltip>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      },
                    }}
                  />
                )}

                {data.view_by === 'team' && (
                  <Table<TeamRow>
                    rowKey="team_id"
                    columns={teamColumns}
                    dataSource={data.rows}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} teams` }}
                    locale={{ emptyText: 'No data' }}
                  />
                )}
              </>
            )}
          </Spin>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
