'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Layout,
  Card,
  Typography,
  Form,
  Select,
  DatePicker,
  Switch,
  Button,
  Table,
  Statistic,
  Row,
  Col,
  Tag,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'
import { BarChartOutlined } from '@ant-design/icons'

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface CompanyOpt {
  id: string
  name: string
}

interface StatusOpt {
  id: number
  slug: string
  title: string
}

interface CustomerTimeReportProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

type ReportTicket = {
  id: number
  title: string | null
  status: string | null
  is_completed: boolean
  is_urgent: boolean
}

type ReportData = {
  company: { id: string; name: string | null }
  filters: {
    start: string | null
    end: string | null
    status: string[] | null
    urgent_only: boolean
  }
  summary: {
    ticket_count: number
    completed_ticket_count: number
    urgent_ticket_count: number
    total_reported_seconds: number
    session_count: number
  }
  tickets: ReportTicket[]
}

export default function CustomerTimeReportContent({ user: currentUser }: CustomerTimeReportProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm<{
    company_id: string
    range: [Dayjs, Dayjs] | null
    status_slugs: string[] | undefined
    urgent_only: boolean
  }>()
  const [companies, setCompanies] = useState<CompanyOpt[]>([])
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [report, setReport] = useState<ReportData | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingMeta(true)
      try {
        const [cRes, sRes] = await Promise.all([
          fetch('/api/companies', { credentials: 'include' }),
          fetch('/api/ticket-statuses', { credentials: 'include' }),
        ])
        if (!cRes.ok) throw new Error('Failed to load companies')
        if (!sRes.ok) throw new Error('Failed to load statuses')
        const cJson = (await cRes.json()) as { data?: CompanyOpt[] }
        const sJson = (await sRes.json()) as StatusOpt[]
        setCompanies(
          (cJson.data ?? []).map((r) => ({
            id: r.id,
            name: r.name,
          }))
        )
        setStatuses(
          (Array.isArray(sJson) ? sJson : []).map((r) => ({
            id: r.id,
            slug: r.slug,
            title: r.title,
          }))
        )
      } catch (e) {
        message.error((e as Error).message)
      } finally {
        setLoadingMeta(false)
      }
    }
    load()
  }, [])

  const buildQuery = useCallback(
    (values: {
      company_id?: string
      range?: [Dayjs, Dayjs] | null
      status_slugs?: string[]
      urgent_only?: boolean
    }) => {
      const params = new URLSearchParams()
      if (!values.company_id) return null
      params.set('company_id', values.company_id)
      const range = values.range
      if (range?.[0]) params.set('start', range[0].startOf('day').toISOString())
      if (range?.[1]) params.set('end', range[1].endOf('day').toISOString())
      const st = values.status_slugs
      if (st && st.length > 0) params.set('status', st.join(','))
      if (values.urgent_only) params.set('urgent_only', '1')
      return params.toString()
    },
    []
  )

  const fetchReport = async () => {
    let values: {
      company_id: string
      range?: [Dayjs, Dayjs] | null
      status_slugs?: string[]
      urgent_only?: boolean
    }
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const qs = buildQuery(values)
    if (!qs) {
      message.warning('Select a company')
      return
    }
    setReportLoading(true)
    try {
      const res = await fetch(`/api/reports/customer-time?${qs}`, { credentials: 'include' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || res.statusText)
      }
      setReport((await res.json()) as ReportData)
    } catch (e) {
      message.error((e as Error).message)
      setReport(null)
    } finally {
      setReportLoading(false)
    }
  }

  const columns: ColumnsType<ReportTicket> = [
    { title: 'ID', dataIndex: 'id', width: 90 },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 140,
      render: (s: string | null) => <Tag>{s ?? '—'}</Tag>,
    },
    {
      title: 'Urgent',
      dataIndex: 'is_urgent',
      width: 90,
      render: (u: boolean) => (u ? <Tag color="red">Yes</Tag> : <Text type="secondary">No</Text>),
    },
    {
      title: 'Completed',
      dataIndex: 'is_completed',
      width: 110,
      render: (c: boolean) => (c ? <Tag color="green">Yes</Tag> : <Text type="secondary">No</Text>),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 24 }}>
            <Title level={3} style={{ margin: 0 }}>
              <BarChartOutlined style={{ marginRight: 8 }} />
              Customer time report
            </Title>
            <Text type="secondary">
              Aggregates use reported duration (billable adjustment) from completed time-tracker sessions.
            </Text>
          </div>

          <Card loading={loadingMeta} style={{ marginBottom: 24 }}>
            <Form form={form} layout="vertical" initialValues={{ urgent_only: false }} onFinish={fetchReport}>
              <Row gutter={16}>
                <Col xs={24} md={10}>
                  <Form.Item
                    name="company_id"
                    label="Company"
                    rules={[{ required: true, message: 'Select a company' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select company"
                      options={companies.map((c) => ({ value: c.id, label: c.name }))}
                      loading={loadingMeta}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={14}>
                  <Form.Item name="range" label="Session start (optional)">
                    <RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={14}>
                  <Form.Item name="status_slugs" label="Ticket status (optional)">
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="All statuses"
                      options={statuses.map((s) => ({ value: s.slug, label: s.title }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={10}>
                  <Form.Item name="urgent_only" label="Urgent only" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={reportLoading}>
                Load report
              </Button>
            </Form>
          </Card>

          {report ? (
            <>
              <Card title={report.company.name ?? report.company.id} style={{ marginBottom: 24 }}>
                <Row gutter={[16, 16]}>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Tickets" value={report.summary.ticket_count} />
                  </Col>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Sessions" value={report.summary.session_count} />
                  </Col>
                  <Col xs={12} sm={8} md={5}>
                    <Statistic title="Total reported" value={formatDuration(report.summary.total_reported_seconds)} />
                  </Col>
                  <Col xs={12} sm={8} md={5}>
                    <Statistic title="Completed tickets" value={report.summary.completed_ticket_count} />
                  </Col>
                  <Col xs={12} sm={8} md={6}>
                    <Statistic title="Urgent tickets" value={report.summary.urgent_ticket_count} />
                  </Col>
                </Row>
              </Card>
              <Card title="Tickets in scope (max 500)">
                <Table
                  rowKey="id"
                  size="small"
                  columns={columns}
                  dataSource={report.tickets}
                  loading={reportLoading}
                  pagination={{ pageSize: 25 }}
                />
              </Card>
            </>
          ) : null}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
