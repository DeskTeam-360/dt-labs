'use client'

import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  FlagOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Dropdown, Flex, Layout, message, Modal, Row, Select, Space, Spin, Tooltip,Typography } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'

import {
  LazyCustomerDashboardBarBlock,
  LazyCustomerDashboardDonutBlock,
} from '@/components/dashboard/CustomerDashboardChartsLazy'
import DashboardAnnouncementsSection from '@/components/dashboard/DashboardAnnouncementsSection'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { canDeleteTickets } from '@/lib/auth-utils'
import type { StoppedTimeSession } from '@/lib/dashboard-hourly-activity'

const { Title, Text } = Typography

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return '0m'
}

const DEFAULT_COLORS = ['#1890ff', '#eb2f96', '#faad14', '#52c41a', '#13c2c2', '#722ed1']

const RECHARTS_TOOLTIP_STYLE: CSSProperties = {
  background: 'var(--ticket-nav-panel-bg)',
  border: '1px solid var(--ticket-nav-panel-border)',
  borderRadius: 8,
  color: 'var(--foreground)',
}

interface DashboardData {
  company_id: string | null
  my_tickets_count: number
  tickets_by_type: Array<{ type_title: string; type_id: number | null; count: number; color: string }>
  priority_counts: Array<{ priority_id: number; priority_title: string; count: number; color: string }>
  time_by_type: Array<{ type_title: string; seconds: number; color: string }>
  total_time_seconds: number
  status_counts: Array<{ status_slug: string; status_title: string; count: number; color: string }>
  last_due_date: string | null
  urgent_due_date: string | null
  last_due_ticket?: { id: number; title: string } | null
  urgent_due_ticket?: { id: number; title: string } | null
  recent_tickets: Array<{
    id: number
    title: string
    due_date: string | null
    updated_at: string
    status_slug: string
    status_title: string
    customer_title: string
    status_color: string
    priority_id: number | null
    priority_title: string
    priority_color: string
    assignee_name: string | null
    company_name: string | null
    tags?: Array<{ id: string; name: string; color: string | null }>
  }>
}

interface CustomerDashboardContentProps {
  user: {
    id: string
    email?: string | null
    name?: string | null
    role?: string
    user_metadata?: { full_name?: string; avatar_url?: string }
  }
  /** When true, wrap with AdminSidebar (for /dashboard) */
  withSidebar?: boolean
}

const { Content } = Layout

interface KnowledgeBaseArticle {
  id: string
  title: string
  status: string
  description: string
  category: string
  sort_order: number
}

const FAQ_ITEMS = [
  'How do I submit a new request?',
  'What kind of requests can I send?',
  'How can I check the status of my request?',
  'How long will it take to complete my request?',
  "What does 'unlimited tasks per month, 2 tasks at a time' mean?",
  'Do I get the rights to the design created?',
]

export default function CustomerDashboardContent({ user, withSidebar }: CustomerDashboardContentProps) {
  const router = useRouter()
  const canMoveTicketToTrash = canDeleteTickets(user.role)
  const sidebarUser = { ...user, role: user.role ?? undefined }
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [kbArticles, setKbArticles] = useState<KnowledgeBaseArticle[]>([])
  const [kbCategory, setKbCategory] = useState<string>('')
  const [hourlyStopped, setHourlyStopped] = useState<StoppedTimeSession[]>([])
  const [hourlyActive, setHourlyActive] = useState<Array<{ ticket_id: number; start_time: string }>>([])

  const ticketsNeedActionListHref = useMemo(() => {
    if (!data?.status_counts?.length) return '/tickets?view=list'
    const withTickets = data.status_counts.filter((s) => s.count > 0 && s.status_slug)
    if (withTickets.length === 0) return '/tickets?view=list'
    const qs = new URLSearchParams()
    qs.set('view', 'list')
    qs.set('status', withTickets.map((s) => s.status_slug).join(','))
    return `/tickets?${qs.toString()}`
  }, [data?.status_counts])

  const fetchHourlyTimeData = useCallback(async () => {
    if (!user?.id) return
    try {
      const startOfMonth = dayjs().subtract(30, 'day').startOf('day').toISOString()
      const end = dayjs().toISOString()
      const [stoppedRes, activeRes] = await Promise.all([
        fetch(
          `/api/users/time-tracker?user_id=${user.id}&filter=custom&start=${encodeURIComponent(startOfMonth)}&end=${encodeURIComponent(end)}&stopped_only=1&limit=500`,
          { credentials: 'include' }
        ),
        fetch(`/api/users/time-tracker?user_id=${user.id}&active_only=1`, { credentials: 'include' }),
      ])
      const stopped = stoppedRes.ok ? await stoppedRes.json() : []
      const act = activeRes.ok ? await activeRes.json() : []
      setHourlyStopped(Array.isArray(stopped) ? stopped : [])
      const list = Array.isArray(act) ? act : []
      setHourlyActive(
        list.map((t: { ticket_id: number; start_time: string }) => ({
          ticket_id: t.ticket_id,
          start_time: t.start_time,
        }))
      )
    } catch {
      setHourlyStopped([])
      setHourlyActive([])
    }
  }, [user?.id])

  useEffect(() => {
    fetchHourlyTimeData()
  }, [fetchHourlyTimeData])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [dashRes, kbRes] = await Promise.all([
          fetch('/api/customer/dashboard', { credentials: 'include' }),
          fetch('/api/knowledge-base-articles?published=true', { credentials: 'include' }),
        ])
        if (!cancelled) {
          if (dashRes.ok) {
            setData(await dashRes.json())
          } else {
            setData(null)
          }
          if (kbRes.ok) {
            const json = await kbRes.json()
            setKbArticles(json || [])
          } else {
            setKbArticles([])
          }
        }
      } catch {
        if (!cancelled) {
          setData(null)
          setKbArticles([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredKbArticles = useMemo(() => {
    if (!kbCategory) return kbArticles
    return kbArticles.filter((a) => a.category === kbCategory)
  }, [kbArticles, kbCategory])

  const barChartData = useMemo(() => {
    if (!data?.tickets_by_type?.length) return []
    return data.tickets_by_type.map((t, i) => ({
      name: t.type_title,
      count: t.count,
      fill: t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      type_id: t.type_id,
    }))
  }, [data?.tickets_by_type])

  const donutData = useMemo(() => {
    if (!data?.time_by_type?.length) return []
    return data.time_by_type.map((t, i) => ({
      name: t.type_title,
      value: t.seconds,
      fill: t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    }))
  }, [data?.time_by_type])

  const totalTimeFormatted = data ? formatTime(data.total_time_seconds) : '0m'
  const maxPriority = Math.max(...(data?.priority_counts?.map((p) => p.count) ?? [1]), 1)

  const content = (
    <div style={{ padding: 24, background: 'var(--layout-bg)', boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>Dashboard</Title>
        </div>
        
      </div>

      <DashboardAnnouncementsSection />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[16, 16]} style={{ margin: 0, maxWidth: '100%' }}>
          {/* My Tickets - Bar Chart */}
          <Col xs={24} lg={24}>
            <Card>
              <Flex justify="space-between" align="center">
                <div>
                  <Title level={2} style={{ margin: 0 }}>My Tickets</Title>
                  <Text type="secondary">Tickets belonging to my company</Text>
                </div>
                <div>
                  <Text type="secondary">
                    Total Tickets: {data?.my_tickets_count ?? 0} tickets
                  </Text>
                </div>
              </Flex>
              <Row gutter={24}>
                <Col xs={24} lg={12} style={{ padding: 16, borderRadius: 8 }}>
                  <div style={{ background: 'var(--customer-dash-chart-surface)', padding: 16, borderRadius: 8 }}>


                    {barChartData.length > 0 ? (
                      <div className="customer-dash-recharts" style={{ height: 300 }}>
                        <LazyCustomerDashboardBarBlock
                          barChartData={barChartData}
                          tooltipStyle={RECHARTS_TOOLTIP_STYLE}
                          onBarTypeClick={(typeId) => {
                            const qs = new URLSearchParams()
                            qs.set('view', 'list')
                            qs.set('type_ids', String(typeId))
                            router.push(`/tickets?${qs.toString()}`)
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Text type="secondary">No tickets yet</Text>
                      </div>
                    )}
                  </div>
                </Col>
                <Col xs={24} lg={12} style={{ padding: 16, borderRadius: 8 }}>
                  <div style={{ position: 'relative', background: 'var(--customer-dash-chart-surface)', padding: 16, borderRadius: 8, height: '100%' }}>
                    {/* Last Due Date - My Ticket */}
                    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', position: 'absolute', top: 0, right: 40, gap: 4, background: 'var(--customer-dash-eta-banner)', padding: '8px 16px', borderRadius: '0 0 10px 10px' }}>
                      <Tooltip title={data?.last_due_ticket ? `#${data.last_due_ticket.id} ${data.last_due_ticket.title}` : undefined}>
                        <Text
                          type="danger"
                          style={{ fontWeight: 700, cursor: data?.last_due_ticket ? 'pointer' : 'default' }}
                          onClick={() => data?.last_due_ticket && router.push(`/tickets/${data.last_due_ticket!.id}`)}
                        >
                          <ClockCircleOutlined style={{ marginRight: 4, fontWeight: 700 }} /> Most Closest ETA: {data?.last_due_date ? dayjs(data.last_due_date).format('MMM DD, YYYY') : 'N/A'}
                        </Text>
                      </Tooltip>
                      <Tooltip title={data?.urgent_due_ticket ? `#${data.urgent_due_ticket.id} ${data.urgent_due_ticket.title}` : undefined}>
                        <Text
                          type="danger"
                          style={{ fontWeight: 700, cursor: data?.urgent_due_ticket ? 'pointer' : 'default' }}
                          onClick={() => data?.urgent_due_ticket && router.push(`/tickets/${data.urgent_due_ticket!.id}`)}
                        >
                          <FlagOutlined style={{ marginRight: 4, fontWeight: 700 }} /> Urgent ETA: {data?.urgent_due_date ? dayjs(data.urgent_due_date).format('MMM DD, YYYY') : 'N/A'}
                        </Text>
                      </Tooltip>
                    </div>
                    <br /><br /><br />
                    {(data?.priority_counts?.length ?? 0) > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {data!.priority_counts.map((p, i) => (
                          <div key={p.priority_id ?? i}>
                            <div
                              role={p.count > 0 ? 'link' : undefined}
                              tabIndex={p.count > 0 ? 0 : undefined}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 4,
                                gap: 8,
                                padding: 8,
                                cursor: p.count > 0 ? 'pointer' : 'default',
                                borderRadius: 8,
                              }}
                              onClick={() => {
                                if (p.count === 0) return
                                const qs = new URLSearchParams()
                                qs.set('view', 'list')
                                qs.set('priority_ids', String(p.priority_id))
                                router.push(`/tickets?${qs.toString()}`)
                              }}
                              onKeyDown={
                                p.count > 0
                                  ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        const qs = new URLSearchParams()
                                        qs.set('view', 'list')
                                        qs.set('priority_ids', String(p.priority_id))
                                        router.push(`/tickets?${qs.toString()}`)
                                      }
                                    }
                                  : undefined
                              }
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 2,
                                    background: p.color || '#1890ff',
                                    flexShrink: 0,
                                  }}
                                />
                                <Text style={p.count > 0 ? { color: '#1890ff' } : undefined}>{p.priority_title}</Text>
                              </div>
                              <div
                                style={{
                                  width: '75%',
                                  height: 8,
                                  borderRadius: 4,
                                  background: 'var(--customer-dash-priority-track)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${(p.count / maxPriority) * 100}%`,
                                    background: p.color || '#1890ff',
                                    borderRadius: 4,
                                  }}
                                />
                              </div>
                              <Text strong style={{ fontSize: 16 }}>{p.count}</Text>
                            </div>

                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Text type="secondary">No priority data</Text>
                      </div>
                    )}
                  </div>
                </Col>
              </Row>



            </Card>
          </Col>

          {/* Time Spent - Donut */}
          <Col xs={24} lg={10}>
            <Card>
              <Flex justify="space-between" align="center">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>Time Spent</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Show:</Text>
                    <Select
                      value="current-day"
                      size="small"
                      variant="borderless"
                      style={{ fontSize: 12, minWidth: 100 }}
                      options={[{ label: 'Current Day', value: 'current-day' }, { label: 'This Week', value: 'week' }, { label: 'All Time', value: 'all' }]}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ClockCircleOutlined style={{ color: '#13c2c2', fontSize: 18 }} />
                  <Text strong style={{ fontSize: 16 }}>{totalTimeFormatted}</Text>
                </div>
              </Flex>
              {donutData.length > 0 ? (
                <LazyCustomerDashboardDonutBlock
                  donutData={donutData}
                  formatTime={formatTime}
                  tooltipStyle={RECHARTS_TOOLTIP_STYLE}
                />
              ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">No time tracked yet</Text>
                </div>
              )}
            </Card>
          </Col>

          {/* Tickets Status */}
          <Col xs={24} lg={14}>
            <Card>
              <Flex justify="space-between" style={{ marginBottom: 16 }} align="center">
                <span
                  role="link"
                  tabIndex={0}
                  style={{
                    fontWeight: 600,
                    fontSize: 16,
                    color: '#1890ff',
                    cursor: 'pointer',
                  }}
                  onClick={() => router.push(ticketsNeedActionListHref)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(ticketsNeedActionListHref)
                    }
                  }}
                >
                  Assigned and need action
                </span>
              </Flex>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {(data?.status_counts?.length ?? 0) > 0 && (
                  <Row gutter={[16, 12]}>
                    {data!.status_counts.map((s, i) => (
                      <Col xs={24} sm={12} key={`status-${s.status_slug}-${i}`}>
                        <div
                          role={s.count > 0 ? 'link' : undefined}
                          tabIndex={s.count > 0 ? 0 : undefined}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: s.count > 0 ? 'pointer' : 'default',
                          }}
                          onClick={() => {
                            if (s.count === 0 || !s.status_slug) return
                            const qs = new URLSearchParams()
                            qs.set('view', 'list')
                            qs.set('status', s.status_slug)
                            router.push(`/tickets?${qs.toString()}`)
                          }}
                          onKeyDown={
                            s.count > 0
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    const qs = new URLSearchParams()
                                    qs.set('view', 'list')
                                    qs.set('status', s.status_slug)
                                    router.push(`/tickets?${qs.toString()}`)
                                  }
                                }
                              : undefined
                          }
                        >
                          <span style={{ width: 20, height: 20, background: s.color, flexShrink: 0 }} />
                          <Text style={s.count > 0 ? { color: '#1890ff' } : undefined}>
                            {s.status_title}: {s.count} tickets
                          </Text>
                        </div>
                      </Col>
                    ))}
                  </Row>
                )}

              </div>
              {(data?.status_counts?.length ?? 0) === 0 && (data?.priority_counts?.length ?? 0) === 0 && (
                <div style={{ minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">No status data</Text>
                </div>
              )}
            </Card>
          </Col>

          {/* Knowledge Base — whole card opens /reference */}
          <Col xs={24} lg={12}>
            <Card
              hoverable
              role="link"
              tabIndex={0}
              onClick={() => router.push('/reference')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  router.push('/reference')
                }
              }}
              styles={{ body: { cursor: 'pointer' } }}
            >
              <span style={{ fontWeight: 600, fontSize: 16 }}>Frequently asked questions</span>
              <br />
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>How can we help you today?</Text>
              {/* <Space orientation="vertical" style={{ width: '100%' }}>
                <Select
                  placeholder="Filter by category"
                  style={{ width: '100%' }}
                  allowClear
                  value={kbCategory || undefined}
                  onChange={(v) => setKbCategory(v ?? '')}
                  options={[
                    { label: 'General', value: 'general' },
                    { label: 'Requests', value: 'requests' },
                  ]}
                />
              </Space> */}
              <div style={{ marginTop: 16 }}>
                {filteredKbArticles.length > 0 ? (
                  filteredKbArticles.map((art) => (
                    <div
                      key={art.id}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}
                    >
                      <QuestionCircleOutlined style={{ color: '#1890ff', marginTop: 2 }} />
                      <Text>{art.title}</Text>
                    </div>
                  ))
                ) : (
                  FAQ_ITEMS.map((q, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
                      <QuestionCircleOutlined style={{ color: '#1890ff', marginTop: 2 }} />
                      <Text>{q}</Text>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </Col>

          {/* Check Tickets Status */}
          <Col xs={24} lg={12}>
            <Card>
              <Flex justify="space-between" align="center">
               <span style={{ fontWeight: 600, fontSize: 16 }}>Check Tickets Status</span>
              
                <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/tickets?new=1')}>
                  New Ticket
                </Button>
                </Flex>
              
              
              <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Preview Tickets list</Text>
              {(data?.recent_tickets?.length ?? 0) > 0 ? (
                <Flex vertical justify="center" align="center" gap={12}>
                  {data!.recent_tickets.map((t) => (
                    <Flex key={t.id} justify="space-between" gap={12}
                      style={{
                        width: '100%',
                        padding: 16,
                        background: 'var(--kanban-card-bg)',
                        borderRadius: 12,
                        border: '1px solid var(--kanban-card-border)',
                        boxShadow: 'var(--kanban-card-shadow)',
                        cursor: 'pointer',
                      }}
                      onClick={() => router.push(`/tickets/${t.id}`)}
                    >
                      <Flex vertical justify="left" align="left" gap={0}>
                        <Text strong style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--kanban-card-title)', lineHeight: 1.4 }}>
                        #{t.id} {t.title}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#1890ff', display: 'block', }}>
                          by {t.assignee_name || t.company_name || 'Unassigned'}
                        </Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                          {t.due_date && (() => {
                            const today = dayjs().startOf('day');
                            const dueDay = dayjs(t.due_date).startOf('day');
                            let color: string = 'var(--kanban-card-muted)' // default gray
                            if (dueDay.isBefore(today)) {
                              color = '#ff4d4f'; // red (overdue)
                            } else if (dueDay.isSame(today)) {
                              color = '#ff4d4f'; // red (today/H)
                            } else if (dueDay.diff(today, 'day') < 1) {
                              color = '#faad14'; // yellow (less than 1 day)
                            }
                            return (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color, fontWeight: 700 }}>
                                <FlagOutlined style={{ fontSize: 12 }} />
                                Due {dayjs(t.due_date).format('MMM DD, YYYY')}
                              </span>
                            )
                          })()}
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
                            <ClockCircleOutlined style={{ fontSize: 12 }} />
                            Last Updated {dayjs(t.updated_at).format('MMM DD, YYYY')}
                          </span>
                        </div>
                      </Flex>
                      <Flex justify="space-between" gap={12} align="center">
                        <span
                          role={t.priority_id != null ? 'button' : undefined}
                          tabIndex={t.priority_id != null ? 0 : undefined}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: t.priority_color,
                            color: '#fff',
                            cursor: t.priority_id != null ? 'pointer' : 'default',
                            outline: 'none',
                          }}
                          title={t.priority_id != null ? 'Filter tickets by this priority' : undefined}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (t.priority_id == null) return
                            const qs = new URLSearchParams()
                            qs.set('view', 'list')
                            qs.set('priority_ids', String(t.priority_id))
                            router.push(`/tickets?${qs.toString()}`)
                          }}
                          onKeyDown={
                            t.priority_id != null
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    const qs = new URLSearchParams()
                                    qs.set('view', 'list')
                                    qs.set('priority_ids', String(t.priority_id))
                                    router.push(`/tickets?${qs.toString()}`)
                                  }
                                }
                              : undefined
                          }
                        >
                          {t.priority_title}
                        </span>
                        {t.tags && t.tags.length > 0 && t.tags.map((tag) => (
                          <span
                            key={tag.id}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              background: tag.color || 'var(--ticket-row-chip-neutral-bg)',
                              color: tag.color ? '#fff' : 'var(--ticket-row-chip-neutral-fg)',
                            }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        <span
                          role="button"
                          tabIndex={0}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: t.status_color,
                            color: '#fff',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                          title="Filter tickets by this status"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!t.status_slug) return
                            const qs = new URLSearchParams()
                            qs.set('view', 'list')
                            qs.set('status', t.status_slug)
                            router.push(`/tickets?${qs.toString()}`)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              if (!t.status_slug) return
                              const qs = new URLSearchParams()
                              qs.set('view', 'list')
                              qs.set('status', t.status_slug)
                              router.push(`/tickets?${qs.toString()}`)
                            }
                          }}
                        >
                          {t.customer_title ?? t.status_title}
                        </span>
                        <Dropdown
                          menu={{
                            items: [
                              {
                                key: 'edit',
                                label: 'Edit',
                                icon: <EditOutlined />,
                                onClick: (e) => {
                                  e.domEvent.stopPropagation()
                                  router.push(`/tickets/${t.id}`)
                                },
                              },
                              ...(canMoveTicketToTrash
                                ? [
                                    {
                                      key: 'delete',
                                      label: 'Move to trash',
                                      icon: <DeleteOutlined />,
                                      danger: true,
                                      onClick: (e: { domEvent: { stopPropagation: () => void } }) => {
                                        e.domEvent.stopPropagation()
                                        Modal.confirm({
                                          title: 'Move ticket to trash?',
                                          content: 'The ticket will be moved to trash instead of being removed.',
                                          okText: 'Move to trash',
                                          okButtonProps: { danger: true },
                                          cancelText: 'Cancel',
                                          onOk: async () => {
                                            try {
                                              const res = await fetch(`/api/tickets/${t.id}`, { method: 'DELETE', credentials: 'include' })
                                              if (!res.ok) {
                                                const err = await res.json().catch(() => ({}))
                                                throw new Error(err?.error || 'Failed to move to trash')
                                              }
                                              message.success('Ticket moved to trash')
                                              fetchStats()
                                              fetchHourlyTimeData()
                                            } catch (err) {
                                              message.error((err as Error).message || 'Failed to move ticket to trash')
                                            }
                                          },
                                        })
                                      },
                                    },
                                  ]
                                : []),
                            ],
                          }}
                          trigger={['click']}
                        >
                          <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={(e) => { e.stopPropagation() }} style={{ marginLeft: 4 }} />
                        </Dropdown>
                      </Flex>


                    </Flex>
                  ))}
                </Flex>
              ) : (
                <div style={{ minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">No tickets yet</Text>
                  <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => router.push('/tickets?new=1')}>
                    Create your first ticket
                  </Button>
                </div>
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )

  if (withSidebar) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <AdminSidebar user={sidebarUser} collapsed={collapsed} onCollapse={setCollapsed} />
        <AdminMainColumn collapsed={collapsed} user={sidebarUser}>
          <Content
            style={{
              padding: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              minHeight: '100vh',
              minWidth: 0,
            }}
          >
            {content}
          </Content>
        </AdminMainColumn>
      </Layout>
    )
  }
  return content
}
