'use client'

import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Flex, Input, Layout, message, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography

type PoolTicket = {
  id: number
  updated_at: string | null
  last_activity_at: string | null
  title: string
  status: string
  priority: number | null
  assignees: string[]
  today_seconds: number
  running: { user: string; seconds: number }[]
  highlight: boolean
}
type PoolCompany = {
  company_id: string
  name: string
  plan_hours: number
  active_users: string[]
  daily_seconds: number
  daily_pct: number | null
  weekly_seconds: number
  weekly_pct: number | null
  tickets: PoolTicket[]
}
type PoolReport = { generated_at: string; search_found: boolean; companies: PoolCompany[] }

const STATUS_LABEL: Record<string, string> = { open: 'Open', received: 'Received', working_team: 'Working Team' }
const SORT_OPTIONS = [
  { value: 'customer', label: 'Customer priority' },
  { value: 'weekly', label: 'Weekly spend' },
  { value: 'daily', label: 'Daily spend' },
]

const fmtDur = (sec: number) => {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export default function PoolReportContent({ user: currentUser }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([])
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [sort, setSort] = useState('customer')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<PoolReport | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/companies', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { id: string; name: string; is_customer?: boolean; is_active?: boolean }[] } | null) =>
        setCompanyOptions((j?.data ?? []).filter((c) => c.is_customer && c.is_active !== false).map((c) => ({ value: c.id, label: c.name })))
      )
      .catch(() => setCompanyOptions([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ sort, order })
      if (companyIds.length) qs.set('company_id', companyIds.join(','))
      if (search.trim()) qs.set('search', search.trim())
      const res = await fetch(`/api/reports/pool?${qs.toString()}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText)
      const rep = data as PoolReport
      setReport(rep)
      // Rows stay collapsed, except when searching for one ticket: its customer opens straight away.
      setExpanded(search.trim() && rep.search_found ? rep.companies.map((c) => c.company_id) : [])
    } catch (e) {
      message.error((e as Error).message)
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [companyIds, sort, order, search])

  useEffect(() => {
    void load()
    // Load once on open; later changes go through the Load button / Enter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns: ColumnsType<PoolTicket> = [
    { title: 'Priority', dataIndex: 'priority', width: 90, align: 'right', render: (v: number | null) => v ?? '—' },
    {
      title: 'Active Ticket',
      key: 'ticket',
      render: (_: unknown, t) => (
        <a href={`/tickets/${t.id}`} target="_blank" rel="noopener noreferrer">
          #{t.id} - {t.title}
        </a>
      ),
    },
    { title: 'Status', dataIndex: 'status', width: 140, render: (v: string) => STATUS_LABEL[v] ?? v },
    {
      title: 'Last activity',
      dataIndex: 'last_activity_at',
      width: 150,
      render: (v: string | null) =>
        v ? (
          <Tooltip title={`${dayjs(v).format('MMM DD, YYYY HH:mm')}. A comment, a change or time tracked by a person (automation not counted).`}>
            <Text>{dayjs(v).fromNow()}</Text>
          </Tooltip>
        ) : (
          '—'
        ),
    },
    {
      title: 'Last update',
      dataIndex: 'updated_at',
      width: 150,
      render: (v: string | null) =>
        v ? (
          <Tooltip title={dayjs(v).format('MMM DD, YYYY HH:mm')}>
            <Text type="secondary">{dayjs(v).fromNow()}</Text>
          </Tooltip>
        ) : (
          '—'
        ),
    },
    {
      title: 'Assigned to',
      dataIndex: 'assignees',
      width: 200,
      render: (v: string[]) => (v.length ? v.join(', ') : <Text type="secondary">Not assigned</Text>),
    },
    {
      title: 'Total Time now',
      key: 'now',
      width: 300,
      render: (_: unknown, t) =>
        t.running.length ? (
          <Tag color="green" style={{ margin: 0 }}>
            Timer active ({fmtDur(Math.max(...t.running.map((r) => r.seconds)))}) · {t.running.map((r) => r.user.split(' ')[0]).join(', ')}
          </Tag>
        ) : t.today_seconds > 0 ? (
          <Text>Worked today ({fmtDur(t.today_seconds)})</Text>
        ) : (
          <Text type="secondary">Still not working today</Text>
        ),
    },
  ]

  const pctTag = (v: number | null) =>
    v == null ? '—' : <Tag color={v > 100 ? 'red' : v >= 80 ? 'gold' : 'green'} style={{ margin: 0 }}>{v}%</Tag>

  const companyColumns: ColumnsType<PoolCompany> = [
    { title: 'Company Name', dataIndex: 'name', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Plan Package', dataIndex: 'plan_hours', width: 110, align: 'center' },
    { title: 'Open Tickets', key: 'count', width: 110, align: 'center', render: (_: unknown, c) => c.tickets.length },
    {
      title: 'Active now',
      key: 'active',
      width: 190,
      render: (_: unknown, c) =>
        c.active_users.length ? (
          <Flex gap={4} wrap>
            {c.active_users.map((n) => (
              <Tag key={n} color="green" style={{ margin: 0 }}>{n.split(' ')[0]}</Tag>
            ))}
          </Flex>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    { title: 'Daily Spend', key: 'daily', width: 130, align: 'center', render: (_: unknown, c) => fmtDur(c.daily_seconds) },
    { title: '% Today', key: 'dpct', width: 100, align: 'center', render: (_: unknown, c) => pctTag(c.daily_pct) },
    { title: 'Weekly Spend', key: 'weekly', width: 130, align: 'center', render: (_: unknown, c) => fmtDur(c.weekly_seconds) },
    { title: '% This Week', key: 'wpct', width: 110, align: 'center', render: (_: unknown, c) => pctTag(c.weekly_pct) },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...currentUser, role: currentUser.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back to Settings</Button>
              </SpaNavLink>
              <Title level={2} style={{ margin: '8px 0 0' }}>Pool Report</Title>
              <Text type="secondary">
                Customers and the tickets still waiting or in work (Open, Received, Working Team), with time spent today and this week (WIB).
                Weekly % is measured against 5 days of the plan hours.
              </Text>
            </div>

            <Card size="small">
              <Row gutter={[16, 12]} align="bottom">
                <Col xs={24} lg={8}>
                  <Text strong>Customer</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="All customers"
                    maxTagCount="responsive"
                    style={{ width: '100%' }}
                    value={companyIds}
                    options={companyOptions}
                    onChange={setCompanyIds}
                  />
                </Col>
                <Col xs={24} lg={6}>
                  <Text strong>Sorting</Text>
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      style={{ width: '65%' }}
                      value={sort}
                      options={SORT_OPTIONS}
                      onChange={(v) => {
                        setSort(v)
                        setOrder(v === 'customer' ? 'asc' : 'desc')
                      }}
                    />
                    <Select
                      style={{ width: '35%' }}
                      value={order}
                      options={[
                        { value: 'asc', label: 'Asc' },
                        { value: 'desc', label: 'Desc' },
                      ]}
                      onChange={setOrder}
                    />
                  </Space.Compact>
                </Col>
                <Col xs={24} lg={6}>
                  <Text strong>Search by ticket</Text>
                  <Input allowClear placeholder="e.g. 52387 or #52387" value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => void load()} />
                </Col>
                <Col xs={24} lg={4}>
                  <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()} block>
                    Load report
                  </Button>
                </Col>
              </Row>
            </Card>

            {report && report.companies.length === 0 ? (
              <Alert
                type="info"
                showIcon
                title={search.trim() && !report.search_found ? `Ticket ${search.trim()} was not found.` : 'No customers to show.'}
              />
            ) : null}

            {report && report.companies.length > 0 ? (
              <Table<PoolCompany>
                rowKey="company_id"
                size="middle"
                bordered
                loading={loading}
                columns={companyColumns}
                dataSource={report.companies}
                pagination={false}
                scroll={{ x: 900 }}
                expandable={{
                  expandedRowKeys: expanded,
                  onExpandedRowsChange: (keys) => setExpanded(keys as string[]),
                  expandedRowRender: (c) => (
                    <Table<PoolTicket>
                      rowKey="id"
                      size="small"
                      columns={columns}
                      dataSource={c.tickets}
                      pagination={false}
                      locale={{ emptyText: 'No open tickets' }}
                      scroll={{ x: 800 }}
                      onRow={(t) => ({
                        style: t.highlight
                          ? { background: '#ffe58f', fontWeight: 600 }
                          : t.assignees.length === 0
                            ? { background: '#e6ffe6' }
                            : undefined,
                      })}
                    />
                  ),
                }}
              />
            ) : null}
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
