'use client'

import { Layout, Card, Row, Col, Typography, Spin, Button, Select, Space, Flex, Dropdown, Modal, message } from 'antd'
import {
  ClockCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  EllipsisOutlined,
  FlagOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import AdminSidebar from './AdminSidebar'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const { Title, Text } = Typography

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return '0m'
}

const DEFAULT_COLORS = ['#1890ff', '#eb2f96', '#faad14', '#52c41a', '#13c2c2', '#722ed1']

interface DashboardData {
  company_id: string | null
  my_tickets_count: number
  tickets_by_type: Array<{ type_title: string; type_id: number | null; count: number; color: string }>
  priority_counts: Array<{ priority_title: string; count: number; color: string }>
  time_by_type: Array<{ type_title: string; seconds: number; color: string }>
  total_time_seconds: number
  status_counts: Array<{ status_title: string; count: number; color: string }>
  last_due_date: string | null
  urgent_due_date: string | null
  recent_tickets: Array<{
    id: number
    title: string
    due_date: string | null
    updated_at: string
    status_title: string
    customer_title: string
    status_color: string
    priority_title: string
    priority_color: string
    assignee_name: string | null
    company_name: string | null
    tags?: Array<{ id: string; name: string; color: string | null }>
  }>
}

interface CustomerDashboardContentProps {
  user: { id: string; email?: string | null; name?: string | null; user_metadata?: { full_name?: string; avatar_url?: string } }
  /** When true, wrap with AdminSidebar (for /dashboard) */
  withSidebar?: boolean
}

const { Content } = Layout

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
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customer/dashboard', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const barChartData = useMemo(() => {
    if (!data?.tickets_by_type?.length) return []
    return data.tickets_by_type.map((t, i) => ({
      name: t.type_title,
      count: t.count,
      fill: t.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
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
    <div style={{ padding: 24, background: '#f0f2f5', boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>Dashboard</Title>
        </div>
        
      </div>

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
                  <div style={{ background: "#F4F5FF", padding: 16, borderRadius: 8 }}>


                    {barChartData.length > 0 ? (
                      <div style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {barChartData.map((entry, idx) => (
                                <Cell key={idx} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Text type="secondary">No tickets yet</Text>
                      </div>
                    )}
                  </div>
                </Col>
                <Col xs={24} lg={12} style={{ padding: 16, borderRadius: 8 }}>
                  <div style={{ background: "#F4F5FF", padding: 16, borderRadius: 8, height: '100%' }}>
                    {/* Last Due Date - My Ticket */}
                    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', position: 'absolute', top: 16, right: 40, gap: 4, background: "#FFE0E5", padding: '8px 16px', borderRadius: "0 0 10px 10px " }}>
                      <Text type="danger" style={{ fontWeight: 700 }}>
                        <ClockCircleOutlined style={{ marginRight: 4, fontWeight: 700 }} /> Most Closest ETA: {data?.last_due_date ? dayjs(data.last_due_date).format('MMM DD, YYYY') : 'N/A'}
                      </Text>
                      <Text type="danger" style={{ fontWeight: 700 }}>
                        <FlagOutlined style={{ marginRight: 4, fontWeight: 700 }} /> Urgent ETA: {data?.urgent_due_date ? dayjs(data.urgent_due_date).format('MMM DD, YYYY') : 'N/A'}
                      </Text>
                    </div>
                    <br /><br /><br />
                    {(data?.priority_counts?.length ?? 0) > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {data!.priority_counts.map((p, i) => (
                          <div key={i}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8, padding: 8 }}>
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
                                <Text>{p.priority_title}</Text>
                              </div>
                              <div
                                style={{
                                  width: '80%',
                                  height: 8,
                                  borderRadius: 4,
                                  background: '#f0f0f0',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={65}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {donutData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number | undefined) => formatTime(v ?? 0)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: '#F8F9FB',
                      borderRadius: 8,
                      padding: 16,
                    }}
                  >
                    {donutData.map((d, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: i < donutData.length - 1 ? '10px 0' : '0 0 0 0',
                          borderBottom: i < donutData.length - 1 ? '1px solid rgb(0, 0, 0)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 12, height: 12, borderRadius: 2, background: d.fill, flexShrink: 0 }} />
                          <Text style={{ fontSize: 13 }}>{d.name}</Text>
                        </div>
                        <Text strong style={{ fontSize: 13 }}>{formatTime(d.value)}</Text>
                      </div>
                    ))}
                  </div>
                </div>
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
                <span style={{ fontWeight: 600, fontSize: 16 }}>Assigned and need action</span>
                  
              </Flex>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {(data?.status_counts?.length ?? 0) > 0 && (
                  <Row gutter={[16, 12]}>
                    {data!.status_counts.map((s, i) => (
                      <Col xs={24} sm={12} key={`status-${i}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 20, height: 20, background: s.color, flexShrink: 0 }} />
                          <Text>{s.status_title}: {s.count} tickets</Text>
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

          {/* Knowledge Base */}
          <Col xs={24} lg={12}>
            <Card >
            <span style={{ fontWeight: 600, fontSize: 16 }}>Knowledge base</span>
              <br />  
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>How can we help you today?</Text>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Select placeholder="General" style={{ width: '100%' }} allowClear options={[{ label: 'General', value: 'general' }, { label: 'Requests', value: 'requests' }]} />
              </Space>
              <div style={{ marginTop: 16 }}>
                {FAQ_ITEMS.map((q, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                    <QuestionCircleOutlined style={{ color: '#1890ff', marginTop: 2 }} />
                    <Text>{q}</Text>
                  </div>
                ))}
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
                    <Flex justify="space-between" gap={12}
                      style={{
                        width: '100%',
                        padding: 16,
                        background: '#fff',
                        borderRadius: 12,
                        border: '1px solid #f0f0f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        cursor: 'pointer',
                      }}
                      onClick={() => router.push(`/tickets/${t.id}`)}
                    >
                      <Flex vertical justify="left" align="left" gap={0}>
                        <Text strong style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#1f2937', lineHeight: 1.4 }}>
                        #{t.id} {t.title}
                        </Text>
                        <Text style={{ fontSize: 13, color: '#1890ff', display: 'block', }}>
                          by {t.assignee_name || t.company_name || 'Unassigned'}
                        </Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                          {t.due_date && (() => {
                            const today = dayjs().startOf('day');
                            const dueDay = dayjs(t.due_date).startOf('day');
                            let color = '#9ca3af'; // default gray
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
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9ca3af' }}>
                            <ClockCircleOutlined style={{ fontSize: 12 }} />
                            Last Updated {dayjs(t.updated_at).format('MMM DD, YYYY')}
                          </span>
                        </div>
                      </Flex>
                      <Flex justify="space-between" gap={12} align="center">
                        <span
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: t.priority_color,
                            color: '#fff',
                          }}
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
                              background: tag.color || '#e9ecef',
                              color: tag.color ? '#fff' : '#495057',
                            }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        <span
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            background: t.status_color,
                            color: '#fff',
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
                              {
                                key: 'delete',
                                label: 'Delete',
                                icon: <DeleteOutlined />,
                                danger: true,
                                onClick: (e) => {
                                  e.domEvent.stopPropagation()
                                  Modal.confirm({
                                    title: 'Delete Ticket',
                                    content: 'Are you sure you want to delete this ticket?',
                                    okText: 'Yes',
                                    cancelText: 'No',
                                    onOk: async () => {
                                      try {
                                        const res = await fetch(`/api/tickets/${t.id}`, { method: 'DELETE', credentials: 'include' })
                                        if (!res.ok) {
                                          const err = await res.json().catch(() => ({}))
                                          throw new Error(err?.error || 'Failed to delete')
                                        }
                                        message.success('Ticket deleted')
                                        fetchStats()
                                      } catch (err) {
                                        message.error((err as Error).message || 'Failed to delete ticket')
                                      }
                                    },
                                  })
                                },
                              },
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
        <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
        <Layout
          style={{
            marginLeft: collapsed ? 80 : 250,
            transition: 'margin-left 0.2s',
            minHeight: '100vh',
            background: '#f0f2f5',
          }}
        >
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
        </Layout>
      </Layout>
    )
  }
  return content
}
