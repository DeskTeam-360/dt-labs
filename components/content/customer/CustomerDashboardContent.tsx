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
import { Button, Card, Col, Dropdown, Flex, Layout, message, Modal, Row, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'

import { LazyCustomerDashboardBarBlock } from '@/components/dashboard/CustomerDashboardChartsLazy'
import DashboardAnnouncementsSection from '@/components/dashboard/DashboardAnnouncementsSection'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { canDeleteTickets } from '@/lib/auth-utils'
import { kanbanTagStyle } from '@/lib/kanban-tag-chip-style'

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
  priority_counts: Array<{ priority: number; count: number }>
  time_by_type: Array<{ type_title: string; seconds: number; color: string }>
  total_time_seconds: number
  status_counts: Array<{ status_slug: string; status_title: string; count: number; color: string }>
  last_due_date: string | null
  last_due_ticket?: { id: number; title: string } | null
  recent_tickets: Array<{
    id: number
    title: string
    due_date: string | null
    updated_at: string
    status_slug: string
    status_title: string
    customer_title: string
    status_color: string
    priority: number | null
    creator_name: string | null
    tags?: Array<{ id: string; name: string; color: string | null }>
    total_time_seconds?: number
  }>
  monthly_summary?: {
    this_month_completed: number
    last_month_completed: number
    this_month_time_seconds: number
  }
  awaiting_response?: Array<{ id: number; title: string; status: string; updated_at: string }>
  recent_team_updates?: Array<{ ticket_id: number; ticket_title: string; comment: string; author_name: string | null; created_at: string }>
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
  const ticketsNeedActionListHref = useMemo(() => {
    if (!data?.status_counts?.length) return '/tickets?view=list'
    const withTickets = data.status_counts.filter((s) => s.count > 0 && s.status_slug)
    if (withTickets.length === 0) return '/tickets?view=list'
    const qs = new URLSearchParams()
    qs.set('view', 'list')
    qs.set('status', withTickets.map((s) => s.status_slug).join(','))
    return `/tickets?${qs.toString()}`
  }, [data?.status_counts])

  /** Refetch dashboard aggregates (e.g. after moving a ticket to trash). */
  const refreshDashboard = useCallback(async () => {
    try {
      const dashRes = await fetch(`/api/customer/dashboard`, { credentials: 'include' })
      if (dashRes.ok) {
        setData(await dashRes.json())
      }
    } catch {
      /* keep current data */
    }
  }, [])


  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [dashRes, kbRes] = await Promise.all([
          fetch(`/api/customer/dashboard`, { credentials: 'include' }),
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
          {/* Monthly Summary */}
          <Col xs={24}>
            <Card>
              <span style={{ fontWeight: 600, fontSize: 16 }}>This Month&apos;s Summary</span>
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} sm={12}>
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: 36, fontWeight: 700, color: '#52c41a' }}>
                      {data?.monthly_summary?.this_month_completed ?? 0}
                    </div>
                    <Text type="secondary">Tickets completed this month</Text>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{ fontSize: 36, fontWeight: 700, color: '#8c8c8c' }}>
                      {data?.monthly_summary?.last_month_completed ?? 0}
                    </div>
                    <Text type="secondary">Tickets completed last month</Text>
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* My Tickets + Tickets by Status — combined */}
          <Col xs={24}>
            <Card>
              <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                <div>
                  <Title level={2} style={{ margin: 0 }}>My Tickets</Title>
                  <Text type="secondary">All tickets for your company</Text>
                </div>
                <Text type="secondary">Total: {data?.my_tickets_count ?? 0} tickets</Text>
              </Flex>
              <Row gutter={[24, 16]}>
                <Col xs={24} lg={14}>
                  <div style={{ background: 'var(--customer-dash-chart-surface)', padding: 16, borderRadius: 8 }}>
                    {barChartData.length > 0 ? (
                      <div className="customer-dash-recharts" style={{ height: 220 }}>
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
                <Col xs={24} lg={10}>
                  <Title level={4} style={{ marginBottom: 12 }}>Tickets by Status</Title>
                  {(data?.status_counts?.length ?? 0) > 0 ? (
                    <Row gutter={[16, 10]}>
                      {data!.status_counts.map((s, i) => (
                        <Col xs={24} sm={12} key={`status-${s.status_slug}-${i}`}>
                          <div
                            role={s.count > 0 ? 'link' : undefined}
                            tabIndex={s.count > 0 ? 0 : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: s.count > 0 ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (s.count === 0 || !s.status_slug) return
                              const qs = new URLSearchParams()
                              qs.set('view', 'list')
                              qs.set('status', s.status_slug)
                              router.push(`/tickets?${qs.toString()}`)
                            }}
                          >
                            <span style={{ width: 14, height: 14, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                            <Text style={s.count > 0 ? { color: '#1890ff' } : undefined}>
                              {s.status_title}: {s.count}
                            </Text>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  ) : (
                    <Text type="secondary">No status data</Text>
                  )}
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Awaiting Response */}
          <Col xs={24}>
            <Card>
              <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>Awaiting Your Response</span>
                <Tag color="orange">{data?.awaiting_response?.length ?? 0}</Tag>
              </Flex>
              {(data?.awaiting_response?.length ?? 0) > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data!.awaiting_response!.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => router.push(`/tickets/${t.id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--kanban-card-bg)',
                        border: '1px solid var(--kanban-card-border)',
                        cursor: 'pointer',
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <Text strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          #{t.id} {t.title}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Updated {dayjs(t.updated_at).format('MMM DD, YYYY')}
                        </Text>
                      </div>
                      {(() => {
                        const s = data?.status_counts?.find((sc) => sc.status_slug === t.status)
                        return (
                          <Tag style={{ flexShrink: 0, ...kanbanTagStyle({ fillHex: s?.color }) }}>
                            {s?.status_title ?? t.status}
                          </Tag>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">No tickets awaiting your response</Text>
                </div>
              )}
            </Card>
          </Col>

          {/* Recent Team Updates */}
          <Col xs={24} lg={12}>
            <Card>
              <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>Recent Team Updates</span>
              </Flex>
              {(data?.recent_team_updates?.length ?? 0) > 0 ? (
                <Flex vertical gap={12}>
                  {data!.recent_team_updates!.map((u, i) => (
                    <Flex
                      key={i}
                      justify="space-between"
                      gap={12}
                      onClick={() => router.push(`/tickets/${u.ticket_id}`)}
                      style={{
                        width: '100%',
                        padding: 16,
                        background: 'var(--kanban-card-bg)',
                        borderRadius: 12,
                        border: '1px solid var(--kanban-card-border)',
                        boxShadow: 'var(--kanban-card-shadow)',
                        cursor: 'pointer',
                      }}
                    >
                      <Flex vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 16, fontWeight: 700, color: 'var(--kanban-card-title)', lineHeight: 1.4 }}>
                          #{u.ticket_id} {u.ticket_title}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#1890ff' }}>
                          by {u.author_name}
                        </Text>
                        <Text
                          type="secondary"
                          style={{ fontSize: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {u.comment}
                        </Text>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
                          <ClockCircleOutlined style={{ fontSize: 12 }} />
                          {dayjs(u.created_at).format('MMM DD, HH:mm')}
                        </span>
                      </Flex>
                    </Flex>
                  ))}
                </Flex>
              ) : (
                <div style={{ minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">No recent updates from the team</Text>
                </div>
              )}
            </Card>
          </Col>

          {/* Check Tickets Status */}
          <Col xs={24} lg={12}>
            <Card>
              <Flex justify="space-between" align="center">
               <span style={{ fontWeight: 600, fontSize: 16 }}>Recent Tickets</span>
              
                <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/tickets?new=1')}>
                  New Ticket
                </Button>
                </Flex>
              
              
              {(data?.recent_tickets?.length ?? 0) > 0 ? (
                <Flex vertical justify="center" align="center" gap={12} style={{ marginTop: 12 }}>
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
                        <Text style={{ fontSize: 13, color: '#1890ff', display: 'block' }}>
                          by {t.creator_name || 'Unknown'}
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
                        {t.priority != null && t.priority > 0 && (
                          <Tag style={kanbanTagStyle({ neutral: true })}>P{t.priority}</Tag>
                        )}
                        {t.tags?.map((tag) => (
                          <Tag
                            key={tag.id}
                            style={kanbanTagStyle({
                              ...(tag.color ? { fillHex: tag.color } : { neutral: true }),
                            })}
                          >
                            {tag.name}
                          </Tag>
                        ))}
                        <Tag
                          style={kanbanTagStyle({
                            fillHex: t.status_color,
                            cursor: 'pointer',
                          })}
                          title="Filter tickets by this status"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!t.status_slug) return
                            const qs = new URLSearchParams()
                            qs.set('view', 'list')
                            qs.set('status', t.status_slug)
                            router.push(`/tickets?${qs.toString()}`)
                          }}
                        >
                          {t.customer_title ?? t.status_title}
                        </Tag>
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
                                              void refreshDashboard()
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
