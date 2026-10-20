'use client'

import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Form,
  Layout,
  message,
  Progress,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import {
  CUSTOMER_TIME_REPORT_DATE_PRESET_OPTIONS,
  type CustomerTimeReportDatePresetKey,
  resolveDatePresetToRange,
} from '@/lib/customer-time-report-defaults'

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

export type CompanyShare = {
  company_id: string | null
  name: string
  is_customer: boolean
  hours: number
  pct_of_capacity: number | null
  pct_of_worked: number | null
  top_tickets?: { ticket_id: number; title: string; hours: number; pct_of_company: number | null }[]
}
export type DayRow = { date: string; reason: string; capacity_hours: number; worked_hours: number; free_hours: number }
export type Person = {
  user_id: string
  name: string
  position: string | null
  teams: string[]
  capacity_hours: number
  worked_hours: number
  worked_hours_all: number
  non_customer_hours: number
  utilization_pct: number | null
  free_hours: number
  overtime_hours: number
  off_day_work_hours: number
  idle_days: number
  loose_days: number
  extra_time_hours: number
  top_company_share_pct: number | null
  companies: CompanyShare[]
  days: DayRow[]
}
export type Report = {
  start: string
  end: string
  customer_only: boolean
  clipped_to_today?: boolean
  future_range?: boolean
  loose_day_min_free_hours: number
  summary: {
    people: number
    capacity_hours: number
    worked_hours: number
    utilization_pct: number | null
    free_hours: number
    overtime_hours: number
    under_50: number
    over_100: number
  } | null
  people: Person[]
}

const REASON_LABEL: Record<string, string> = {
  work: 'Working day',
  weekend: 'Weekend',
  holiday: 'Holiday',
  leave: 'Leave',
  sick: 'Sick',
  piket: 'On duty',
  other: 'Other',
  not_employed: 'Not employed',
}

/** Company with the most hours (the list itself follows the manual display order). */
const topCompanyOf = (p: Person): CompanyShare | undefined =>
  p.companies.reduce<CompanyShare | undefined>((best, c) => (!best || c.hours > best.hours ? c : best), undefined)

export const fmtH = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} h`)
export const pctColor = (p: number | null) => (p == null ? 'default' : p > 100 ? 'red' : p >= 80 ? 'green' : p >= 50 ? 'gold' : 'orange')

export function PersonDetail({ p, minFree }: { p: Person; minFree: number }) {
  const [allDays, setAllDays] = useState(false)
  const dayData = useMemo(
    () => (allDays ? p.days.filter((d) => d.capacity_hours > 0 || d.worked_hours > 0) : p.days.filter((d) => d.capacity_hours > 0 && d.free_hours >= minFree)),
    [p.days, allDays, minFree]
  )
  const companyCols: ColumnsType<CompanyShare> = [
    { title: 'Company', dataIndex: 'name', ellipsis: true },
    {
      title: 'Type',
      dataIndex: 'is_customer',
      width: 100,
      render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? 'Customer' : 'Internal'}</Tag>,
    },
    { title: 'Hours', dataIndex: 'hours', width: 90, align: 'right', render: (v: number) => fmtH(v) },
    { title: '% of capacity', dataIndex: 'pct_of_capacity', width: 120, align: 'right', render: (v: number | null) => (v == null ? '—' : `${v}%`) },
    { title: '% of worked', dataIndex: 'pct_of_worked', width: 110, align: 'right', render: (v: number | null) => (v == null ? '—' : `${v}%`) },
  ]
  const dayCols: ColumnsType<DayRow> = [
    { title: 'Date', dataIndex: 'date', width: 150, render: (v: string) => dayjs(v).format('ddd, D MMM') },
    { title: 'Day type', dataIndex: 'reason', width: 120, render: (v: string) => REASON_LABEL[v] ?? v },
    { title: 'Capacity', dataIndex: 'capacity_hours', width: 90, align: 'right', render: (v: number) => fmtH(v) },
    { title: 'Worked', dataIndex: 'worked_hours', width: 90, align: 'right', render: (v: number) => fmtH(v) },
    {
      title: 'Free',
      dataIndex: 'free_hours',
      width: 90,
      align: 'right',
      render: (v: number, r) => (r.capacity_hours > 0 && v >= minFree ? <Text strong type="warning">{fmtH(v)}</Text> : fmtH(v)),
    },
  ]
  return (
    <Row gutter={[24, 16]}>
      <Col xs={24} xl={11}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>Where the time went</Text>
        <Table
          size="small"
          bordered
          rowKey={(r) => r.company_id ?? 'none'}
          pagination={false}
          columns={companyCols}
          dataSource={p.companies}
          locale={{ emptyText: 'No time logged in this range' }}
          expandable={{
            rowExpandable: (r) => (r.top_tickets?.length ?? 0) > 0,
            expandedRowRender: (r) => (
              <Table
                size="small"
                pagination={false}
                rowKey="ticket_id"
                dataSource={r.top_tickets}
                columns={[
                  {
                    title: `Top ${r.top_tickets?.length ?? 0} ticket${(r.top_tickets?.length ?? 0) === 1 ? '' : 's'} worked`,
                    dataIndex: 'title',
                    ellipsis: true,
                    render: (v: string, t: { ticket_id: number }) => (
                      <SpaNavLink href={`/tickets/${t.ticket_id}`}>
                        #{t.ticket_id} {v}
                      </SpaNavLink>
                    ),
                  },
                  { title: 'Hours', dataIndex: 'hours', width: 90, align: 'right', render: (v: number) => fmtH(v) },
                  { title: '% of company', dataIndex: 'pct_of_company', width: 120, align: 'right', render: (v: number | null) => (v == null ? '—' : `${v}%`) },
                ]}
              />
            ),
          }}
        />
      </Col>
      <Col xs={24} xl={13}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
          <Text strong>{allDays ? 'All working days' : `Loose days (free ≥ ${minFree} h)`}</Text>
          <Space size={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>Show all days</Text>
            <Switch size="small" checked={allDays} onChange={setAllDays} />
          </Space>
        </Flex>
        <Table size="small" bordered rowKey="date" columns={dayCols} dataSource={dayData} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: 'No loose days — fully booked' }} />
      </Col>
    </Row>
  )
}

export default function TeamReportContent({ user: currentUser }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm<{ team_ids: string[]; range: [Dayjs, Dayjs] | null; date_preset?: CustomerTimeReportDatePresetKey; customer_only: boolean }>()
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    fetch('/api/teams', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; name: string }[]) => setTeams((Array.isArray(rows) ? rows : []).map((t) => ({ id: t.id, name: t.name }))))
      .catch(() => setTeams([]))
      .finally(() => setLoadingMeta(false))
  }, [])

  const load = async (values: { team_ids: string[]; range: [Dayjs, Dayjs] | null; date_preset?: CustomerTimeReportDatePresetKey; customer_only: boolean }) => {
    let range = values.range
    if (values.date_preset) {
      const r = resolveDatePresetToRange(values.date_preset, dayjs())
      if (r) range = [r.start, r.end]
    }
    if (!range) {
      message.warning('Pick a date range or a rolling date')
      return
    }
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        team_ids: values.team_ids.join(','),
        start: range[0].format('YYYY-MM-DD'),
        end: range[1].format('YYYY-MM-DD'),
      })
      if (values.customer_only) qs.set('customer_only', '1')
      const res = await fetch(`/api/reports/team-utilization?${qs.toString()}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText)
      setReport(data as Report)
    } catch (e) {
      message.error((e as Error).message)
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  const insights = useMemo(() => {
    if (!report?.summary || report.people.length === 0) return []
    const out: { type: 'info' | 'warning' | 'success'; text: string }[] = []
    const withUtil = report.people.filter((p) => p.utilization_pct != null)
    const lowest = [...withUtil].sort((a, b) => (a.utilization_pct ?? 0) - (b.utilization_pct ?? 0)).slice(0, 3)
    if (report.summary.under_50 > 0) {
      out.push({
        type: 'info',
        text: `${report.summary.under_50} ${report.summary.under_50 === 1 ? 'person is' : 'people are'} under 50% utilization. Most room: ${lowest.map((p) => `${p.name} (${p.utilization_pct}%, ${p.free_hours} h free)`).join(', ')}.`,
      })
    }
    if (report.summary.over_100 > 0) {
      out.push({ type: 'warning', text: `${report.summary.over_100} ${report.summary.over_100 === 1 ? 'person is' : 'people are'} over 100% of capacity — check workload or leave data.` })
    }
    const offDay = report.people.filter((p) => p.off_day_work_hours >= 1)
    if (offDay.length > 0) {
      out.push({ type: 'warning', text: `Work on days off (weekend / holiday / leave): ${offDay.map((p) => `${p.name} ${p.off_day_work_hours} h`).join(', ')}. Mark on-duty days in Team Availability if intended.` })
    }
    const idle = report.people.filter((p) => p.idle_days >= 2)
    if (idle.length > 0) {
      out.push({ type: 'info', text: `Working days with no time logged: ${idle.map((p) => `${p.name} ${p.idle_days}`).join(', ')}. Could be missing timers rather than free time.` })
    }
    const concentrated = report.people.filter((p) => (p.top_company_share_pct ?? 0) >= 70 && p.worked_hours >= 5)
    if (concentrated.length > 0) {
      out.push({ type: 'info', text: `Single-company dependence (≥70% of worked time): ${concentrated.map((p) => `${p.name} → ${topCompanyOf(p)?.name} ${p.top_company_share_pct}%`).join(', ')}.` })
    }
    const extra = report.people.reduce((s, p) => s + p.extra_time_hours, 0)
    if (extra > 0) out.push({ type: 'info', text: `${Math.round(extra * 100) / 100} h logged as Extra time in this range.` })
    if (!report.customer_only) {
      const nc = report.people.reduce((s, p) => s + p.non_customer_hours, 0)
      if (nc > 0) out.push({ type: 'info', text: `${Math.round(nc * 100) / 100} h went to non-customer companies. Turn on “Customer only” to see utilization on customer work alone.` })
    } else {
      const nc = report.people.reduce((s, p) => s + p.non_customer_hours, 0)
      if (nc > 0) out.push({ type: 'info', text: `${Math.round(nc * 100) / 100} h on non-customer companies is excluded from the utilization shown.` })
    }
    return out
  }, [report])

  const columns: ColumnsType<Person> = [
    {
      title: 'Person',
      key: 'person',
      fixed: 'left',
      width: 220,
      render: (_: unknown, p) => (
        <Flex vertical gap={0}>
          <Text strong>{p.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{[p.position, p.teams.join(', ')].filter(Boolean).join(' · ')}</Text>
        </Flex>
      ),
    },
    { title: 'Capacity', dataIndex: 'capacity_hours', width: 95, align: 'right', sorter: (a, b) => a.capacity_hours - b.capacity_hours, render: (v: number) => fmtH(v) },
    { title: 'Worked', dataIndex: 'worked_hours', width: 95, align: 'right', sorter: (a, b) => a.worked_hours - b.worked_hours, render: (v: number) => fmtH(v) },
    {
      title: 'Utilization',
      dataIndex: 'utilization_pct',
      width: 190,
      defaultSortOrder: 'descend',
      sorter: (a, b) => (a.utilization_pct ?? -1) - (b.utilization_pct ?? -1),
      render: (v: number | null) =>
        v == null ? (
          <Text type="secondary">No capacity</Text>
        ) : (
          <Flex align="center" gap={8}>
            <Progress percent={Math.min(100, v)} showInfo={false} size="small" status={v > 100 ? 'exception' : 'normal'} style={{ width: 90, margin: 0 }} />
            <Tag color={pctColor(v)} style={{ margin: 0 }}>{v}%</Tag>
          </Flex>
        ),
    },
    { title: 'Free', dataIndex: 'free_hours', width: 90, align: 'right', sorter: (a, b) => a.free_hours - b.free_hours, render: (v: number) => fmtH(v) },
    { title: 'Loose days', dataIndex: 'loose_days', width: 100, align: 'center', sorter: (a, b) => a.loose_days - b.loose_days },
    { title: 'Idle days', dataIndex: 'idle_days', width: 90, align: 'center', sorter: (a, b) => a.idle_days - b.idle_days },
    { title: 'Overtime', dataIndex: 'overtime_hours', width: 95, align: 'right', render: (v: number) => (v > 0 ? <Text type="danger">{fmtH(v)}</Text> : '—') },
    { title: 'Extra time', dataIndex: 'extra_time_hours', width: 100, align: 'right', render: (v: number) => (v > 0 ? fmtH(v) : '—') },
    { title: 'Non-customer', dataIndex: 'non_customer_hours', width: 115, align: 'right', render: (v: number) => (v > 0 ? fmtH(v) : '—') },
    { title: 'Top company', key: 'top', width: 200, ellipsis: true, render: (_: unknown, p) => (topCompanyOf(p) ? `${topCompanyOf(p)!.name} (${p.top_company_share_pct ?? 0}%)` : '—') },
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
              <Title level={2} style={{ margin: '8px 0 0' }}>Team Report</Title>
              <Text type="secondary">
                How much of each person&apos;s available time went into work, and into which companies. Capacity comes from Team
                Availability (leave, on-duty days and holidays are respected). Days are WIB.
              </Text>
            </div>

            <Card size="small">
              <Form form={form} layout="vertical" initialValues={{ team_ids: [], customer_only: false }} onFinish={load}>
                <Row gutter={[16, 0]}>
                  <Col xs={24} lg={8}>
                    <Form.Item name="team_ids" label={<Text strong>Team</Text>} rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one team' }]}>
                      <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="Select team(s)" loading={loadingMeta} maxTagCount="responsive" options={teams.map((t) => ({ value: t.id, label: t.name }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={5}>
                    <Form.Item name="date_preset" label={<Text strong>Rolling dates</Text>}>
                      <Select<CustomerTimeReportDatePresetKey>
                        allowClear
                        placeholder="Custom — use the date range"
                        options={CUSTOMER_TIME_REPORT_DATE_PRESET_OPTIONS}
                        onChange={(v) => {
                          if (v) {
                            const r = resolveDatePresetToRange(v, dayjs())
                            if (r) form.setFieldsValue({ range: [r.start, r.end] })
                          }
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={6}>
                    <Form.Item name="range" label={<Text strong>Date range</Text>}>
                      <RangePicker style={{ width: '100%' }} format="MMM DD, YYYY" onChange={() => form.setFieldValue('date_preset', undefined)} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={5}>
                    <Form.Item name="customer_only" label={<Text strong>Customer only</Text>} valuePropName="checked" tooltip="Count only time on companies marked as customer. Hours will be lower because some tickets belong to non-customer companies.">
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" htmlType="submit" loading={loading}>Load report</Button>
              </Form>
            </Card>

            {report?.summary ? (
              <>
                <Row gutter={[16, 16]}>
                  {[
                    { label: 'People', value: report.summary.people },
                    { label: 'Capacity', value: fmtH(report.summary.capacity_hours) },
                    { label: report.customer_only ? 'Worked (customer)' : 'Worked', value: fmtH(report.summary.worked_hours) },
                    { label: 'Utilization', value: report.summary.utilization_pct == null ? '—' : `${report.summary.utilization_pct}%` },
                    { label: 'Free time', value: fmtH(report.summary.free_hours) },
                    { label: 'Under 50% / Over 100%', value: `${report.summary.under_50} / ${report.summary.over_100}` },
                  ].map((m) => (
                    <Col xs={12} sm={8} lg={4} key={m.label}>
                      <Card size="small">
                        <Text type="secondary" style={{ fontSize: 12 }}>{m.label}</Text>
                        <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                      </Card>
                    </Col>
                  ))}
                </Row>

                {insights.length > 0 ? (
                  <Card size="small" title="Things worth a look">
                    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                      {insights.map((i, idx) => (
                        <Alert key={idx} type={i.type} showIcon title={i.text} />
                      ))}
                    </Space>
                  </Card>
                ) : null}

                <Table<Person>
                  rowKey="user_id"
                  size="small"
                  bordered
                  loading={loading}
                  columns={columns}
                  dataSource={report.people}
                  pagination={false}
                  scroll={{ x: 1300 }}
                  expandable={{ expandedRowRender: (p) => <PersonDetail p={p} minFree={report.loose_day_min_free_hours} /> }}
                />
                {report.clipped_to_today ? (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    The range ends in the future, so the report stops at today ({report.end}).
                  </Text>
                ) : null}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Worked = reported time (adjustments included), including timers still running. Free = capacity minus worked on days
                  that have capacity. Idle days = working days with nothing logged. Loose days = at least {report.loose_day_min_free_hours} h free.
                </Text>
              </>
            ) : report ? (
              <Alert type="info" showIcon title={report.future_range ? 'That date range is still in the future — nothing to report yet.' : 'The selected team(s) have no members.'} />
            ) : null}
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
