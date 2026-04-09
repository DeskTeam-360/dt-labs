'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Row,
  Col,
  Tag,
  message,
  Divider,
  Flex,
  Drawer,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'
import { SpaNavLink } from './SpaNavLink'
import { BarChartOutlined, TeamOutlined, SaveOutlined } from '@ant-design/icons'
import type { CustomerTimeReportGlobalFilters } from '@/lib/customer-time-report-defaults'

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

/** Bar colors aligned with RoundRobin horizontal bar / MUI-style palette */
const CHART_BAR_COLORS = ['#9155FD', '#01C4C4', '#56CA00', '#FFB400', '#FF4C51', '#16B1FF']

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function hoursFromSeconds(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100
}

function truncateLabel(s: string, max = 42): string {
  if (!s) return `Ticket`
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function savedFiltersToFormValues(
  f: CustomerTimeReportGlobalFilters,
  validCompanyIds: Set<string>
): {
  company_ids: string[]
  range: [Dayjs, Dayjs] | null
  status_slugs: string[] | undefined
  urgent_only: boolean
} {
  const company_ids = f.company_ids.filter((id) => validCompanyIds.has(id))
  let range: [Dayjs, Dayjs] | null = null
  if (f.start && f.end) {
    const a = dayjs(f.start)
    const b = dayjs(f.end)
    if (a.isValid() && b.isValid()) range = [a, b]
  }
  return {
    company_ids,
    range,
    status_slugs: f.status_slugs?.length ? f.status_slugs : undefined,
    urgent_only: f.urgent_only,
  }
}

/** Created date + ticket age in whole days (English). */
function formatTicketCreatedAt(iso: string | null): { dateLine: string; ageLine: string } {
  if (!iso) return { dateLine: '—', ageLine: '' }
  const d = dayjs(iso)
  if (!d.isValid()) return { dateLine: '—', ageLine: '' }
  const dateLine = d.format('DD MMM YYYY')
  const days = dayjs().startOf('day').diff(d.startOf('day'), 'day')
  const ageLine =
    days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
  return { dateLine, ageLine }
}

type TimeTrackerSessionRow = {
  id: string
  userId: string
  tracker_type: string
  start_time: string
  stop_time: string | null
  reported_duration_seconds: number
  user: { id: string; full_name: string | null; email: string | null } | null
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
  company_id: string | null
  company_name: string | null
  reported_seconds: number
  created_at: string | null
  priority_title: string | null
  priority_slug?: string | null
  is_urgent: boolean
  /** False = no completed time sessions in the selected period (or ever if no date range). */
  has_reported_time?: boolean
}

type ReportData = {
  companies: { id: string; name: string | null }[]
  filters: {
    start: string | null
    end: string | null
    status: string[] | null
    urgent_only: boolean
    company_ids?: string[]
  }
  summary: {
    ticket_count: number
    completed_ticket_count: number
    urgent_ticket_count: number
    total_reported_seconds: number
    session_count: number
    untouched_ticket_count: number
  }
  tickets: ReportTicket[]
}

export default function CustomerTimeReportContent({ user: currentUser }: CustomerTimeReportProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm<{
    company_ids: string[]
    range: [Dayjs, Dayjs] | null
    status_slugs: string[] | undefined
    urgent_only: boolean
  }>()
  const [companies, setCompanies] = useState<CompanyOpt[]>([])
  const [statuses, setStatuses] = useState<StatusOpt[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [report, setReport] = useState<ReportData | null>(null)

  const [workersOpen, setWorkersOpen] = useState(false)
  const [workersTicket, setWorkersTicket] = useState<ReportTicket | null>(null)
  const [workersSessions, setWorkersSessions] = useState<TimeTrackerSessionRow[]>([])
  const [workersLoading, setWorkersLoading] = useState(false)

  const [savedGlobal, setSavedGlobal] = useState<{
    filters: CustomerTimeReportGlobalFilters | null
    updated_at: string | null
  } | null>(null)
  const [savingGlobalDefault, setSavingGlobalDefault] = useState(false)
  const globalDefaultsAppliedRef = useRef(false)

  useEffect(() => {
    if (!workersOpen || !workersTicket) return
    let cancelled = false
    ;(async () => {
      setWorkersLoading(true)
      try {
        const qs = new URLSearchParams()
        if (report?.filters?.start) qs.set('start', report.filters.start)
        if (report?.filters?.end) qs.set('end', report.filters.end)
        const suffix = qs.toString() ? `?${qs.toString()}` : ''
        const res = await fetch(`/api/tickets/${workersTicket.id}/time-tracker${suffix}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || res.statusText)
        }
        const data = (await res.json()) as TimeTrackerSessionRow[] | unknown
        if (!cancelled) {
          setWorkersSessions(Array.isArray(data) ? data : [])
        }
      } catch (e) {
        if (!cancelled) {
          message.error((e as Error).message)
          setWorkersSessions([])
        }
      } finally {
        if (!cancelled) setWorkersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workersOpen, workersTicket?.id, report?.filters?.start, report?.filters?.end])

  useEffect(() => {
    const load = async () => {
      setLoadingMeta(true)
      try {
        const [cRes, sRes, dRes] = await Promise.all([
          fetch('/api/companies', { credentials: 'include' }),
          fetch('/api/ticket-statuses', { credentials: 'include' }),
          fetch('/api/reports/customer-time/defaults', { credentials: 'include' }),
        ])
        if (!cRes.ok) throw new Error('Failed to load companies')
        if (!sRes.ok) throw new Error('Failed to load statuses')
        const cJson = (await cRes.json()) as { data?: CompanyOpt[] }
        const sJson = (await sRes.json()) as StatusOpt[]
        const companyList = (cJson.data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
        }))
        setCompanies(companyList)
        setStatuses(
          (Array.isArray(sJson) ? sJson : []).map((r) => ({
            id: r.id,
            slug: r.slug,
            title: r.title,
          }))
        )
        if (dRes.ok) {
          const dJson = (await dRes.json()) as {
            filters?: CustomerTimeReportGlobalFilters
            updated_at?: string | null
          }
          setSavedGlobal({
            filters: dJson.filters ?? null,
            updated_at: dJson.updated_at ?? null,
          })
        } else {
          setSavedGlobal(null)
        }
      } catch (e) {
        message.error((e as Error).message)
      } finally {
        setLoadingMeta(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (globalDefaultsAppliedRef.current || !savedGlobal?.filters || companies.length === 0) return
    const validIds = new Set(companies.map((c) => c.id))
    const fields = savedFiltersToFormValues(savedGlobal.filters, validIds)
    if (fields.company_ids.length > 0) {
      form.setFieldsValue({
        company_ids: fields.company_ids,
        range: fields.range ?? undefined,
        status_slugs: fields.status_slugs,
        urgent_only: fields.urgent_only,
      } as Parameters<typeof form.setFieldsValue>[0])
      globalDefaultsAppliedRef.current = true
    }
  }, [savedGlobal, companies, form])

  const buildQuery = useCallback(
    (values: {
      company_ids?: string[]
      range?: [Dayjs, Dayjs] | null
      status_slugs?: string[]
      urgent_only?: boolean
    }) => {
      const params = new URLSearchParams()
      const ids = (values.company_ids ?? []).map((id) => id.trim()).filter(Boolean)
      if (ids.length === 0) return null
      params.set('company_id', [...new Set(ids)].join(','))
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

  const applySavedGlobalToForm = useCallback(() => {
    if (!savedGlobal?.filters) {
      message.info('No global default saved yet')
      return
    }
    const validIds = new Set(companies.map((c) => c.id))
    const fields = savedFiltersToFormValues(savedGlobal.filters, validIds)
    if (fields.company_ids.length === 0) {
      message.warning('Saved default has no companies you can access; pick companies and save again')
      return
    }
    form.setFieldsValue({
      company_ids: fields.company_ids,
      range: fields.range ?? undefined,
      status_slugs: fields.status_slugs,
      urgent_only: fields.urgent_only,
    } as Parameters<typeof form.setFieldsValue>[0])
    message.success('Applied global default filters')
  }, [savedGlobal, companies, form])

  const saveGlobalDefault = useCallback(async () => {
    const v = form.getFieldsValue() as {
      company_ids?: string[]
      range?: [Dayjs, Dayjs] | null
      status_slugs?: string[]
      urgent_only?: boolean
    }
    const ids = [...new Set((v.company_ids ?? []).map((id) => String(id).trim()).filter(Boolean))]
    if (ids.length === 0) {
      message.warning('Select at least one company before saving')
      return
    }
    const filters: CustomerTimeReportGlobalFilters = {
      company_ids: ids,
      start: v.range?.[0]?.startOf('day').toISOString() ?? null,
      end: v.range?.[1]?.endOf('day').toISOString() ?? null,
      status_slugs: v.status_slugs?.length ? v.status_slugs : null,
      urgent_only: Boolean(v.urgent_only),
    }
    setSavingGlobalDefault(true)
    try {
      const res = await fetch('/api/reports/customer-time/defaults', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || res.statusText)
      }
      const data = (await res.json()) as {
        filters: CustomerTimeReportGlobalFilters
        updated_at: string | null
      }
      setSavedGlobal({ filters: data.filters, updated_at: data.updated_at })
      message.success('Global default filters saved')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSavingGlobalDefault(false)
    }
  }, [form])

  const fetchReport = async () => {
    let values: {
      company_ids: string[]
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
      message.warning('Select at least one company')
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

  const multiCompany = (report?.companies?.length ?? 0) > 1

  const chartRows = useMemo(() => {
    if (!report?.tickets?.length) return []
    return [...report.tickets]
      .sort((a, b) => b.reported_seconds - a.reported_seconds)
      .slice(0, 12)
      .map((t) => {
        const base = t.title || `Ticket #${t.id}`
        const prefix = multiCompany && t.company_name ? `${t.company_name} · ` : ''
        return {
          key: String(t.id),
          label: truncateLabel(prefix + base, multiCompany ? 36 : 42),
          hours: hoursFromSeconds(t.reported_seconds),
          fullTitle: prefix + base,
        }
      })
  }, [report, multiCompany])

  const tableData = useMemo(() => {
    if (!report?.tickets) return []
    return [...report.tickets].sort((a, b) => b.reported_seconds - a.reported_seconds)
  }, [report])

  const workersByPerson = useMemo(() => {
    const m = new Map<string, { label: string; seconds: number; sessions: number }>()
    for (const s of workersSessions) {
      const uid = s.userId
      const label = s.user?.full_name?.trim() || s.user?.email?.trim() || `User ${uid.slice(0, 8)}…`
      const prev = m.get(uid) ?? { label, seconds: 0, sessions: 0 }
      prev.seconds += Number(s.reported_duration_seconds) || 0
      prev.sessions += 1
      m.set(uid, prev)
    }
    return [...m.values()].sort((a, b) => b.seconds - a.seconds)
  }, [workersSessions])

  const sessionColumns: ColumnsType<TimeTrackerSessionRow> = [
    {
      title: 'Person',
      key: 'person',
      width: 200,
      ellipsis: true,
      render: (_, s) => s.user?.full_name || s.user?.email || s.userId.slice(0, 8),
    },
    {
      title: 'Type',
      dataIndex: 'tracker_type',
      width: 88,
      render: (t: string) => <Tag>{t || '—'}</Tag>,
    },
    {
      title: 'Started',
      dataIndex: 'start_time',
      width: 148,
      render: (t: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: 'Ended',
      dataIndex: 'stop_time',
      width: 148,
      render: (t: string | null) =>
        t ? dayjs(t).format('YYYY-MM-DD HH:mm') : <Tag color="processing">Running</Tag>,
    },
    {
      title: 'Reported',
      dataIndex: 'reported_duration_seconds',
      width: 100,
      align: 'right',
      render: (sec: number) => formatDuration(Number(sec) || 0),
    },
  ]

  const openWorkersDrawer = useCallback((row: ReportTicket) => {
    setWorkersTicket(row)
    setWorkersOpen(true)
  }, [])

  const columns: ColumnsType<ReportTicket> = [
    {
      title: '#',
      key: 'idx',
      width: 30,
      // fixed: 'left',
      
      align: 'center',
      render: (_: unknown, __: ReportTicket, index: number) => index + 1,
    },
    {
      title: 'Company',
      dataIndex: 'company_name',
      width: 168,
      fixed: 'left',
      ellipsis: true,
      render: (name: string | null) => <Text>{name ?? '—'}</Text>,
    },
    {
      title: 'Ticket',
      dataIndex: 'title',
      ellipsis: true,
      fixed: 'left',
      width: 260,
      render: (t: string | null, r) => (
        <Flex vertical gap={2} style={{ textAlign: 'left', minWidth: 0, maxWidth: '100%' }}>
          <Text strong ellipsis={t ? { tooltip: true } : false} style={{ width: '100%' }}>
            {t || '—'}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ID #{r.id}
          </Text>
        </Flex>
      ),
    },
    {
      title: 'Reported time',
      dataIndex: 'reported_seconds',
      width: 150,
      align: 'center',
      sorter: (a, b) => a.reported_seconds - b.reported_seconds,
      defaultSortOrder: 'descend',
      render: (sec: number, r) => (
        <Flex vertical gap={4} align="center">
          <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(sec)}
          </Text>
          {sec === 0 ? (
            <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
              Not tracked
            </Tag>
          ) : null}
        </Flex>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      align: 'center',
      render: (s: string | null) => <Tag>{s ?? '—'}</Tag>,
    },
    {
      title: 'Priority',
      key: 'priority',
      width: 120,
      align: 'center',
      render: (_: unknown, r: ReportTicket) => {
        const label = r.priority_title?.trim() || '—'
        if (label === '—') return <Text type="secondary">—</Text>
        return (
          <Tag color={r.is_urgent ? 'red' : 'default'} style={{ margin: 0 }}>
            {label}
          </Tag>
        )
      },
    },
    {
      title: 'Created At',
      key: 'created_at',
      width: 156,
      align: 'left',
      sorter: (a, b) => {
        const ta = a.created_at ? dayjs(a.created_at).valueOf() : 0
        const tb = b.created_at ? dayjs(b.created_at).valueOf() : 0
        return ta - tb
      },
      render: (_: unknown, r: ReportTicket) => {
        const { dateLine, ageLine } = formatTicketCreatedAt(r.created_at)
        return (
          <Flex vertical gap={2} style={{ textAlign: 'left' }}>
            <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{dateLine}</Text>
            {ageLine ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {ageLine}
              </Text>
            ) : null}
          </Flex>
        )
      },
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
        <div className="settings-page customer-time-report-page" style={{ padding: 24, width: '100%' }}>
          <Card
            className="customer-time-report-card"
            loading={loadingMeta}
            styles={{ body: { paddingTop: 16 } }}
          >
            <Flex align="center" gap={12} wrap="wrap" style={{ marginBottom: 8 }}>
              <BarChartOutlined style={{ fontSize: 28, color: 'var(--ant-color-primary, #1677ff)' }} />
              <div>
                <Title level={2} className="settings-section-heading" style={{ margin: 0, fontSize: '1.5rem' }}>
                  Customer report
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Select one or more companies. Tickets with no completed time in the period still appear (0 reported,
                  “Not tracked”). Date range: include if the ticket was created in range or any time session overlaps the
                  range (including running timers). Reported seconds use completed sessions that overlap the range. Save
                  global default stores the current filters in the database for all admins and managers on this page.
                </Text>
              </div>
            </Flex>
            <Divider style={{ margin: '12px 0 20px' }} />

            <Form form={form} layout="vertical" initialValues={{ urgent_only: false }} onFinish={fetchReport}>
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={8}>
                  <Form.Item
                    name="company_ids"
                    label={<Text strong>Companies</Text>}
                    rules={[
                      { required: true, message: 'Select at least one company' },
                      {
                        type: 'array',
                        min: 1,
                        message: 'Select at least one company',
                      },
                    ]}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select one or more companies"
                      size="large"
                      maxTagCount="responsive"
                      options={companies.map((c) => ({ value: c.id, label: c.name }))}
                      loading={loadingMeta}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={10}>
                  <Form.Item
                    name="range"
                    label={
                      <Flex gap={16} align="center" wrap="wrap">
                        <Text strong>Date range</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Session start (optional)
                        </Text>
                      </Flex>
                    }
                  >
                    <RangePicker style={{ width: '100%' }} size="large" format="dddd, MMM DD, YYYY" />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={6}>
                  <Form.Item name="status_slugs" label={<Text strong>Ticket status</Text>}>
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="All statuses"
                      size="large"
                      options={statuses.map((s) => ({ value: s.slug, label: s.title }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={4}>
                  <Form.Item name="urgent_only" label={<Text strong>Urgent only</Text>} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Flex gap={12} wrap="wrap" align="center">
                <Button type="primary" htmlType="submit" size="large" loading={reportLoading}>
                  Load report
                </Button>
                <Button
                  type="default"
                  size="large"
                  icon={<SaveOutlined />}
                  loading={savingGlobalDefault}
                  onClick={() => void saveGlobalDefault()}
                >
                  Save global default
                </Button>
                <Button type="link" size="large" onClick={applySavedGlobalToForm}>
                  Apply saved default
                </Button>
              </Flex>
              {savedGlobal?.filters?.company_ids?.length ? (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
                  Global default last saved:{' '}
                  {savedGlobal.updated_at
                    ? dayjs(savedGlobal.updated_at).format('YYYY-MM-DD HH:mm')
                    : '—'}
                </Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
                  No global default with companies saved yet (optional).
                </Text>
              )}
            </Form>

            {report ? (
              <>
                <Divider style={{ margin: '24px 0 16px' }} />
                <Title level={4} className="settings-section-heading" style={{ marginTop: 0, marginBottom: 4 }}>
                  {report.companies.map((c) => c.name ?? c.id).join(', ')}
                </Title>
                {report.companies.length > 1 ? (
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                    {report.companies.length} companies — combined totals below
                  </Text>
                ) : null}

                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  {[
                    { label: 'Tickets', value: report.summary.ticket_count, accent: 'var(--customer-report-accent-1, #9155FD)' },
                    {
                      label: 'No time logged',
                      value: report.summary.untouched_ticket_count ?? 0,
                      accent: '#8c8c8c',
                    },
                    { label: 'Sessions', value: report.summary.session_count, accent: 'var(--customer-report-accent-2, #01C4C4)' },
                    {
                      label: 'Total reported',
                      value: formatDuration(report.summary.total_reported_seconds),
                      accent: 'var(--customer-report-accent-3, #56CA00)',
                    },
                    {
                      label: 'Completed',
                      value: report.summary.completed_ticket_count,
                      accent: 'var(--customer-report-accent-4, #FFB400)',
                    },
                    {
                      label: 'Urgent',
                      value: report.summary.urgent_ticket_count,
                      accent: 'var(--customer-report-accent-5, #FF4C51)',
                    },
                  ].map((m) => (
                    <Col xs={12} sm={8} md={4} key={m.label}>
                      <div className="customer-time-report-metric">
                        <div className="customer-time-report-metric-bar" style={{ background: m.accent }} />
                        <Text type="secondary" className="customer-time-report-metric-label">
                          {m.label}
                        </Text>
                        <div className="customer-time-report-metric-value">{m.value}</div>
                      </div>
                    </Col>
                  ))}
                </Row>

                {chartRows.length > 0 ? (
                  <>
                    <div className="customer-time-report-section-title">
                      <Text strong>Reported time by ticket (top 12)</Text>
                    </div>
                    <div className="customer-time-report-chart-wrap">
                      <ResponsiveContainer width="100%" height={Math.max(280, chartRows.length * 36 + 80)}>
                        <BarChart
                          layout="vertical"
                          data={chartRows}
                          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                          barCategoryGap={8}
                        >
                          <CartesianGrid strokeDasharray="5 5" className="customer-time-report-chart-grid" />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => `${v}h`}
                            fontSize={12}
                            tick={{ fill: 'var(--foreground, rgba(0,0,0,0.65))' }}
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={multiCompany ? 200 : 168}
                            tick={{ fontSize: 11, fill: 'var(--foreground, rgba(0,0,0,0.65))' }}
                          />
                          <Tooltip
                            formatter={(value: number | undefined) => [`${value}h`, 'Reported']}
                            labelFormatter={(_, payload) =>
                              (payload?.[0]?.payload as { fullTitle?: string })?.fullTitle ?? ''
                            }
                            contentStyle={{ borderRadius: 8 }}
                          />
                          <Bar dataKey="hours" name="Hours" radius={[0, 6, 6, 0]} maxBarSize={28}>
                            {chartRows.map((_, i) => (
                              <Cell key={chartRows[i].key} fill={CHART_BAR_COLORS[i % CHART_BAR_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : null}

                <div className="customer-time-report-section-title" style={{ marginTop: 28 }}>
                  <Text strong>Tickets in scope (max 500)</Text>
                </div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  Total records: {tableData.length}. Click a row to see who logged time on that ticket (sessions match
                  your report date range when set).
                </Text>
                <div className="customer-time-report-table-wrap customer-time-report-tickets-clickable">
                  <Table<ReportTicket>
                    rowKey="id"
                    size="small"
                    bordered
                    columns={columns}
                    dataSource={tableData}
                    loading={reportLoading}
                    pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: [25, 50, 100] }}
                    scroll={{ x: 1232 }}
                    onRow={(record) => ({
                      onClick: () => openWorkersDrawer(record),
                      style: { cursor: 'pointer' },
                    })}
                  />
                </div>

                <Drawer
                  title={
                    <Flex align="center" gap={8}>
                      <TeamOutlined />
                      <span>
                        Who worked
                        {workersTicket
                          ? ` — #${workersTicket.id} ${workersTicket.title ? `· ${workersTicket.title}` : ''}`
                          : ''}
                      </span>
                    </Flex>
                  }
                  placement="right"
                  width={680}
                  open={workersOpen}
                  onClose={() => {
                    setWorkersOpen(false)
                    setWorkersTicket(null)
                    setWorkersSessions([])
                  }}
                  destroyOnClose
                  extra={
                    workersTicket ? (
                      <SpaNavLink href={`/tickets/${workersTicket.id}`}>Open ticket</SpaNavLink>
                    ) : null
                  }
                >
                  {report?.filters?.start || report?.filters?.end ? (
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                      Sessions filtered by report date range (overlap with session interval).
                    </Text>
                  ) : (
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                      All time entries on this ticket (no date filter on report).
                    </Text>
                  )}

                  {workersLoading ? (
                    <Text type="secondary">Loading…</Text>
                  ) : workersSessions.length === 0 ? (
                    <Text type="secondary">
                      No sessions in this view (no time logged yet, or none in the selected date range).
                    </Text>
                  ) : (
                    <>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>
                        Summary by person
                      </Text>
                      <Flex wrap="wrap" gap={8} style={{ marginBottom: 20 }}>
                        {workersByPerson.map((p, idx) => (
                          <Tag key={`${p.label}-${idx}`} style={{ padding: '6px 10px', fontSize: 13 }}>
                            {p.label}: {formatDuration(p.seconds)} ({p.sessions} session{p.sessions === 1 ? '' : 's'})
                          </Tag>
                        ))}
                      </Flex>
                      <Table<TimeTrackerSessionRow>
                        rowKey="id"
                        size="small"
                        bordered
                        columns={sessionColumns}
                        dataSource={workersSessions}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 640 }}
                      />
                    </>
                  )}
                </Drawer>
              </>
            ) : null}
          </Card>
        </div>
      </AdminMainColumn>
    </Layout>
  )
}
