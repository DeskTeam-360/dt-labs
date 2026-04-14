'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Layout,
  Card,
  Typography,
  Form,
  Select,
  Input,
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
  Popconfirm,
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
import { BarChartOutlined, TeamOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons'
import {
  CUSTOMER_TIME_REPORT_DATE_PRESET_OPTIONS,
  CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT,
  CUSTOMER_TIME_REPORT_PRESET_TITLE_MAX,
  normalizeDatePreset,
  resolveDatePresetToRange,
  type CustomerTimeReportDatePreset,
  type CustomerTimeReportDatePresetKey,
  type CustomerTimeReportGlobalFilters,
  type CustomerTimeReportPresetDTO,
} from '@/lib/customer-time-report-defaults'
import { ticketStatusDisplayLabel } from '@/lib/ticket-status-kanban'

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

function presetsSortedNewestFirst(presets: CustomerTimeReportPresetDTO[]): CustomerTimeReportPresetDTO[] {
  return [...presets].sort((a, b) => {
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return tb - ta
  })
}

/** Map saved company IDs to canonical IDs from `/api/companies` (case-insensitive UUID match). */
function canonicalCompanyIdsFromSaved(f: CustomerTimeReportGlobalFilters, companies: CompanyOpt[]): string[] {
  const byLower = new Map<string, string>()
  for (const c of companies) {
    byLower.set(c.id.toLowerCase(), c.id)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of f.company_ids) {
    const id = String(raw).trim()
    if (!id) continue
    const canon = byLower.get(id.toLowerCase()) ?? id
    if (!byLower.has(canon.toLowerCase())) continue
    if (seen.has(canon)) continue
    seen.add(canon)
    out.push(canon)
  }
  return out
}

function savedFiltersToFormValues(
  f: CustomerTimeReportGlobalFilters,
  companies: CompanyOpt[],
  statuses: StatusOpt[]
): {
  company_ids: string[]
  range: [Dayjs, Dayjs] | null
  date_preset?: CustomerTimeReportDatePreset
  status_slugs: string[] | undefined
  urgent_only: boolean
} {
  const company_ids = canonicalCompanyIdsFromSaved(f, companies)
  const preset = f.date_preset ?? null
  let range: [Dayjs, Dayjs] | null = null
  if (preset) {
    const r = resolveDatePresetToRange(preset, dayjs())
    if (r) range = [r.start, r.end]
  } else if (f.start && f.end) {
    const a = dayjs(f.start)
    const b = dayjs(f.end)
    if (a.isValid() && b.isValid()) range = [a, b]
  }
  let status_slugs: string[] | undefined
  if (f.status_slugs?.length) {
    const byLower = new Map(statuses.map((s) => [s.slug.toLowerCase(), s.slug]))
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of f.status_slugs) {
      const slug = String(raw).trim()
      if (!slug) continue
      const canon = byLower.get(slug.toLowerCase()) ?? slug
      if (seen.has(canon)) continue
      seen.add(canon)
      out.push(canon)
    }
    status_slugs = out.length ? out : undefined
  }
  return {
    company_ids,
    range,
    date_preset: preset ? preset : undefined,
    status_slugs,
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
    date_preset?: CustomerTimeReportDatePresetKey
    status_slugs: string[] | undefined
    urgent_only: boolean
    preset_title?: string
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

  const [presets, setPresets] = useState<CustomerTimeReportPresetDTO[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null)
  const [savingPreset, setSavingPreset] = useState(false)
  const [deletingPreset, setDeletingPreset] = useState(false)
  const globalDefaultsAppliedRef = useRef(false)

  const loadPresetsFromApi = useCallback(async (): Promise<CustomerTimeReportPresetDTO[]> => {
    const dRes = await fetch('/api/reports/customer-time/defaults', { credentials: 'include' })
    if (!dRes.ok) {
      setPresets([])
      return []
    }
    const dJson = (await dRes.json()) as { presets?: CustomerTimeReportPresetDTO[] }
    const list = Array.isArray(dJson.presets) ? dJson.presets : []
    setPresets(list)
    return list
  }, [])

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
        const [cRes, sRes] = await Promise.all([
          fetch('/api/companies', { credentials: 'include' }),
          fetch('/api/ticket-statuses', { credentials: 'include' }),
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
        await loadPresetsFromApi()
      } catch (e) {
        message.error((e as Error).message)
      } finally {
        setLoadingMeta(false)
      }
    }
    load()
  }, [loadPresetsFromApi])

  useEffect(() => {
    if (globalDefaultsAppliedRef.current || presets.length === 0 || companies.length === 0) return
    const latest = presetsSortedNewestFirst(presets)[0]
    if (!latest?.filters?.company_ids?.length) return
    const fields = savedFiltersToFormValues(latest.filters, companies, statuses)
    if (fields.company_ids.length > 0) {
      form.setFieldsValue({
        company_ids: fields.company_ids,
        range: fields.range ?? undefined,
        date_preset: fields.date_preset,
        status_slugs: fields.status_slugs,
        urgent_only: fields.urgent_only,
        preset_title: latest.title,
      } as Parameters<typeof form.setFieldsValue>[0])
      setSelectedPresetId(latest.id)
      globalDefaultsAppliedRef.current = true
    }
  }, [presets, companies, statuses, form])

  const buildQuery = useCallback(
    (values: {
      company_ids?: string[]
      range?: [Dayjs, Dayjs] | null
      date_preset?: CustomerTimeReportDatePreset
      status_slugs?: string[]
      urgent_only?: boolean
    }) => {
      const params = new URLSearchParams()
      const ids = (values.company_ids ?? []).map((id) => id.trim()).filter(Boolean)
      if (ids.length === 0) return null
      params.set('company_id', [...new Set(ids)].join(','))
      const preset = normalizeDatePreset(values.date_preset)
      let range = values.range
      if (preset) {
        const r = resolveDatePresetToRange(preset, dayjs())
        if (r) range = [r.start, r.end]
      }
      if (range?.[0]) params.set('start', range[0].startOf('day').toISOString())
      if (range?.[1]) params.set('end', range[1].endOf('day').toISOString())
      const st = values.status_slugs
      if (st && st.length > 0) params.set('status', st.join(','))
      if (values.urgent_only) params.set('urgent_only', '1')
      return params.toString()
    },
    []
  )

  const applyPresetToForm = useCallback(
    (preset: CustomerTimeReportPresetDTO) => {
      const fields = savedFiltersToFormValues(preset.filters, companies, statuses)
      if (fields.company_ids.length === 0) {
        message.warning('Preset has no companies you can access; edit companies and save again')
        return
      }
      form.setFieldsValue({
        company_ids: fields.company_ids,
        range: fields.range ?? undefined,
        date_preset: fields.date_preset,
        status_slugs: fields.status_slugs,
        urgent_only: fields.urgent_only,
        preset_title: preset.title,
      } as Parameters<typeof form.setFieldsValue>[0])
      message.success(`Loaded: ${preset.title}`)
    },
    [companies, statuses, form]
  )

  const buildFiltersFromForm = useCallback(() => {
    const v = form.getFieldsValue() as {
      company_ids?: string[]
      range?: [Dayjs, Dayjs] | null
      date_preset?: CustomerTimeReportDatePreset
      status_slugs?: string[]
      urgent_only?: boolean
      preset_title?: string
    }
    const ids = [...new Set((v.company_ids ?? []).map((id) => String(id).trim()).filter(Boolean))]
    if (ids.length === 0) return null
    const datePreset = normalizeDatePreset(v.date_preset)
    const filters: CustomerTimeReportGlobalFilters = {
      company_ids: ids,
      date_preset: datePreset,
      start: datePreset
        ? null
        : v.range?.[0]?.startOf('day').toISOString() ?? null,
      end: datePreset ? null : v.range?.[1]?.endOf('day').toISOString() ?? null,
      status_slugs: v.status_slugs?.length ? v.status_slugs : null,
      urgent_only: Boolean(v.urgent_only),
    }
    return filters
  }, [form])

  const saveNewPreset = useCallback(async () => {
    const v = form.getFieldsValue() as { preset_title?: string }
    const filters = buildFiltersFromForm()
    if (!filters) {
      message.warning('Select at least one company before saving')
      return
    }
    setSavingPreset(true)
    try {
      const res = await fetch('/api/reports/customer-time/defaults', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          title: (v.preset_title ?? '').trim() || CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || res.statusText)
      }
      const data = (await res.json()) as CustomerTimeReportPresetDTO
      await loadPresetsFromApi()
      setSelectedPresetId(data.id)
      form.setFieldValue(
        'preset_title',
        (data.title ?? '').trim() || CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT
      )
      message.success('New preset saved')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSavingPreset(false)
    }
  }, [form, buildFiltersFromForm, loadPresetsFromApi])

  const updateSelectedPreset = useCallback(async () => {
    if (selectedPresetId == null) {
      message.warning('Choose a preset in Saved filters to update, or use Save as new preset')
      return
    }
    const v = form.getFieldsValue() as { preset_title?: string }
    const filters = buildFiltersFromForm()
    if (!filters) {
      message.warning('Select at least one company before saving')
      return
    }
    setSavingPreset(true)
    try {
      const res = await fetch(`/api/reports/customer-time/defaults/${selectedPresetId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          title: (v.preset_title ?? '').trim() || CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || res.statusText)
      }
      await loadPresetsFromApi()
      message.success('Preset updated')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSavingPreset(false)
    }
  }, [selectedPresetId, form, buildFiltersFromForm, loadPresetsFromApi])

  const deleteSelectedPreset = useCallback(async () => {
    if (selectedPresetId == null) return
    setDeletingPreset(true)
    try {
      const res = await fetch(`/api/reports/customer-time/defaults/${selectedPresetId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || res.statusText)
      }
      setSelectedPresetId(null)
      const list = await loadPresetsFromApi()
      if (list.length === 0) {
        globalDefaultsAppliedRef.current = false
      }
      message.success('Preset deleted')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setDeletingPreset(false)
    }
  }, [selectedPresetId, loadPresetsFromApi])

  const hasSavedPresets = presets.length > 0
  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  )

  const companySelectOptions = useMemo(() => {
    const opts = companies.map((c) => ({ value: c.id, label: c.name }))
    const lowerSeen = new Set(opts.map((o) => o.value.toLowerCase()))
    for (const p of presets) {
      for (const raw of p.filters.company_ids ?? []) {
        const id = String(raw).trim()
        if (!id || lowerSeen.has(id.toLowerCase())) continue
        lowerSeen.add(id.toLowerCase())
        opts.push({
          value: id,
          label: `Company (${id.slice(0, 8)}…)`,
        })
      }
    }
    return opts
  }, [companies, presets])

  const statusSelectOptions = useMemo(() => {
    const opts = statuses.map((s) => ({ value: s.slug, label: ticketStatusDisplayLabel(s) }))
    const lowerSeen = new Set(opts.map((o) => o.value.toLowerCase()))
    for (const p of presets) {
      for (const raw of p.filters.status_slugs ?? []) {
        const slug = String(raw).trim()
        if (!slug) continue
        const lo = slug.toLowerCase()
        if (lowerSeen.has(lo)) continue
        lowerSeen.add(lo)
        opts.push({ value: slug, label: slug })
      }
    }
    return opts
  }, [statuses, presets])

  const fetchReport = async () => {
    let values: {
      company_ids: string[]
      range?: [Dayjs, Dayjs] | null
      date_preset?: CustomerTimeReportDatePreset
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
                  C Report
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Select one or more companies. Tickets with no completed time in the period still appear (0 reported,
                  “Not tracked”). Date range: include if the ticket was created in range or any time session overlaps the
                  range (including running timers). Reported seconds use completed sessions that overlap the range. You can
                  save many named presets for everyone with access; Saved filters loads one into the fields below. Rolling
                  date presets (this month, last week, …) are saved by name and recomputed when you load the report. Save as
                  new adds a row; Update overwrites the preset selected in the dropdown.
                </Text>
              </div>
            </Flex>
            <Divider style={{ margin: '12px 0 20px' }} />

            <Form form={form} layout="vertical" initialValues={{ urgent_only: false }} onFinish={fetchReport}>
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12} xl={10}>
                  <Form.Item
                    name="preset_title"
                    label={<Text strong>Preset name</Text>}
                    tooltip="Name shown in the Saved filters list. Each new save can use a different name."
                  >
                    <Input
                      placeholder={CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT}
                      maxLength={CUSTOMER_TIME_REPORT_PRESET_TITLE_MAX}
                      showCount
                      size="large"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12} xl={10}>
                  <Form.Item label={<Text strong>Saved filters</Text>}>
                    <Select<number>
                      placeholder={
                        hasSavedPresets
                          ? 'Load a saved preset into the fields below'
                          : 'No presets yet — set filters and click Save as new preset'
                      }
                      disabled={!hasSavedPresets}
                      allowClear
                      style={{ width: '100%', maxWidth: 440 }}
                      size="large"
                      value={selectedPresetId ?? undefined}
                      options={presets.map((p) => ({ value: p.id, label: p.title }))}
                      onChange={(id) => {
                        setSelectedPresetId(id ?? null)
                        if (id == null) return
                        const p = presets.find((x) => x.id === id)
                        if (p) applyPresetToForm(p)
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>
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
                      options={companySelectOptions}
                      loading={loadingMeta}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={10}>
                  <Form.Item
                    name="date_preset"
                    label={<Text strong>Rolling dates</Text>}
                    tooltip="Stored as this week / this month etc. and recalculated when you run the report. Weeks are ISO (Monday–Sunday). Pick custom dates below to clear this."
                  >
                    <Select<CustomerTimeReportDatePresetKey>
                      allowClear
                      placeholder="Custom — use calendar below"
                      size="large"
                      style={{ width: '100%' }}
                      options={CUSTOMER_TIME_REPORT_DATE_PRESET_OPTIONS}
                      onChange={(v) => {
                        if (v) {
                          const r = resolveDatePresetToRange(v, dayjs())
                          if (r) {
                            form.setFieldsValue({ range: [r.start, r.end] })
                          }
                        }
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="range"
                    label={
                      <Flex gap={16} align="center" wrap="wrap">
                        <Text strong>Date range</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Optional — or use rolling dates above
                        </Text>
                      </Flex>
                    }
                  >
                    <RangePicker
                      style={{ width: '100%' }}
                      size="large"
                      format="dddd, MMM DD, YYYY"
                      onChange={() => form.setFieldValue('date_preset', undefined)}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={6}>
                  <Form.Item name="status_slugs" label={<Text strong>Ticket status</Text>}>
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="All statuses"
                      size="large"
                      options={statusSelectOptions}
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
                  loading={savingPreset}
                  onClick={() => void saveNewPreset()}
                >
                  Save as new preset
                </Button>
                <Button
                  type="default"
                  size="large"
                  loading={savingPreset}
                  disabled={selectedPresetId == null}
                  onClick={() => void updateSelectedPreset()}
                >
                  Update preset
                </Button>
                <Popconfirm
                  title="Delete this preset?"
                  description="Other presets are unchanged."
                  okText="Delete"
                  okButtonProps={{ danger: true, loading: deletingPreset }}
                  disabled={selectedPresetId == null}
                  onConfirm={() => void deleteSelectedPreset()}
                >
                  <Button
                    danger
                    size="large"
                    icon={<DeleteOutlined />}
                    disabled={selectedPresetId == null}
                    loading={deletingPreset}
                  >
                    Delete preset
                  </Button>
                </Popconfirm>
              </Flex>
              {selectedPreset ? (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
                  Selected: «{selectedPreset.title}» — last saved{' '}
                  {selectedPreset.updated_at
                    ? dayjs(selectedPreset.updated_at).format('YYYY-MM-DD HH:mm')
                    : '—'}
                </Text>
              ) : hasSavedPresets ? (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
                  {presets.length} saved preset{presets.length === 1 ? '' : 's'}. Choose one above to update or delete.
                </Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
                  No saved presets yet (optional).
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
