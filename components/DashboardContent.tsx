'use client'

import { Layout, Card, Row, Col, Typography, Statistic, Space, Button, message, List, Empty } from 'antd'
import {
  CheckCircleOutlined,
  FileTextOutlined,
  TeamOutlined,
  FolderOutlined,
  ClockCircleOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import dayjs from 'dayjs'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'

const { Content } = Layout
const { Title, Text } = Typography

interface DashboardContentProps {
  user: User
  stats: {
    totalUsers: number
    totalTeams: number
    completedTodos: number
    totalTodos: number
  }
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export default function DashboardContent({ user, stats }: DashboardContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTracker, setActiveTracker] = useState<{
    id: number
    todo_id: number
    user_id: string
    start_time: string
    ticket?: { id: number; title: string }
  } | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [stopping, setStopping] = useState(false)
  const [lastTrackers, setLastTrackers] = useState<
    Array<{
      id: number | string
      todo_id: number
      start_time: string
      stop_time: string | null
      duration_seconds: number | null
      ticket?: { id: number; title: string }
      user?: { id: string; full_name: string | null; email: string }
    }>
  >([])
  const [loadingTrackers, setLoadingTrackers] = useState(false)
  const [allSessionsForStats, setAllSessionsForStats] = useState<
    Array<{ todo_id: number; start_time: string; stop_time: string | null; duration_seconds: number | null }>
  >([])
  const router = useRouter()
  const supabase = createClient()

  const fetchAllSessionsForStats = async () => {
    try {
      const startOfMonth = dayjs().subtract(30, 'day').startOf('day').toISOString()
      const { data, error } = await supabase
        .from('todo_time_tracker')
        .select('todo_id, start_time, stop_time, duration_seconds')
        .eq('user_id', user.id)
        .not('stop_time', 'is', null)
        .gte('start_time', startOfMonth)
        .order('start_time', { ascending: false })

      if (error) throw error
      setAllSessionsForStats((data || []) as any)
    } catch {
      setAllSessionsForStats([])
    }
  }

  const trackerStats = useMemo(() => {
    const now = dayjs()
    const todayStart = now.startOf('day')
    const weekStart = now.subtract(7, 'day').startOf('day')
    const monthStart = now.subtract(30, 'day').startOf('day')

    let todaySeconds = 0
    let weekSeconds = 0
    let monthSeconds = 0
    const todayTickets = new Set<number>()
    const weekTickets = new Set<number>()
    const monthTickets = new Set<number>()

    allSessionsForStats.forEach((s) => {
      const start = dayjs(s.start_time)
      const dur = s.duration_seconds ?? 0
      if (start.isAfter(todayStart)) {
        todaySeconds += dur
        todayTickets.add(s.todo_id)
      }
      if (start.isAfter(weekStart)) {
        weekSeconds += dur
        weekTickets.add(s.todo_id)
      }
      if (start.isAfter(monthStart)) {
        monthSeconds += dur
        monthTickets.add(s.todo_id)
      }
    })

    return {
      todaySeconds,
      weekSeconds,
      monthSeconds,
      todayTickets: todayTickets.size,
      weekTickets: weekTickets.size,
      monthTickets: monthTickets.size,
    }
  }, [allSessionsForStats])

  const chartData = useMemo(() => {
    const days: { day: string; short: string; duration: number; fullMark: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day')
      const dayStart = d.startOf('day')
      const dayEnd = d.endOf('day')
      const duration = allSessionsForStats
        .filter((s) => {
          const start = dayjs(s.start_time)
          return start.isAfter(dayStart) && start.isBefore(dayEnd)
        })
        .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)
      days.push({
        day: d.format('ddd D/M'),
        short: d.format('ddd'),
        duration: Math.round(duration / 60),
        fullMark: 24 * 60,
      })
    }
    return days
  }, [allSessionsForStats])

  const fetchLastTrackers = async () => {
    setLoadingTrackers(true)
    try {
      const { data, error } = await supabase
        .from('todo_time_tracker')
        .select('id, todo_id, start_time, stop_time, duration_seconds, ticket:tickets(id, title), user:users!todo_time_tracker_user_id_fkey(id, full_name, email)')
        .eq('user_id', user.id)
        .order('start_time', { ascending: false })
        .limit(15)

      if (error) throw error
      setLastTrackers((data || []) as any)
    } catch {
      setLastTrackers([])
    } finally {
      setLoadingTrackers(false)
    }
  }

  useEffect(() => {
    fetchLastTrackers()
    fetchAllSessionsForStats()
  }, [user.id])

  const fetchActiveTracker = async () => {
    try {
      const { data, error } = await supabase
        .from('todo_time_tracker')
        .select('id, todo_id, user_id, start_time, ticket:tickets(id, title)')
        .eq('user_id', user.id)
        .is('stop_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      setActiveTracker(data as any)
    } catch {
      setActiveTracker(null)
    }
  }

  useEffect(() => {
    fetchActiveTracker()
  }, [user.id])

  useEffect(() => {
    if (!activeTracker) {
      setElapsedSeconds(0)
      return
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - new Date(activeTracker.start_time).getTime()) / 1000
      )
      setElapsedSeconds(elapsed)
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTracker])

  const handleStopTracker = async () => {
    if (!activeTracker) return
    setStopping(true)
    try {
      const stopTime = new Date().toISOString()
      const startTime = new Date(activeTracker.start_time)
      let durationSeconds = Math.floor(
        (new Date(stopTime).getTime() - startTime.getTime()) / 1000
      )
      // Cap at PostgreSQL INTEGER max so very long sessions (>68 years) don't overflow
      const MAX_DURATION = 2147483647
      if (durationSeconds > MAX_DURATION) durationSeconds = MAX_DURATION
      if (durationSeconds < 0) durationSeconds = 0

      const { error } = await supabase
        .from('todo_time_tracker')
        .update({
          stop_time: stopTime,
          duration_seconds: durationSeconds,
        })
        .eq('id', String(activeTracker.id))

      if (error) throw error
      setActiveTracker(null)
      setElapsedSeconds(0)
      message.success('Time tracker stopped')
      fetchLastTrackers()
      fetchAllSessionsForStats()
    } catch (error: any) {
      const errMsg = error?.message || error?.error_description || 'Failed to stop tracker'
      message.error(errMsg)
      console.error('Stop tracker error:', error)
    } finally {
      setStopping(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={2}>Welcome!</Title>
          <Text type="secondary">
            This is your dashboard. Start managing your data and activities here.
          </Text>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Users"
                value={stats.totalUsers}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Teams"
                value={stats.totalTeams}
                prefix={<FolderOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Completed Tickets"
                value={stats.completedTodos}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Tickets"
                value={stats.totalTodos}
                prefix={<FileTextOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Time today"
                value={formatTime(trackerStats.todaySeconds)}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#1890ff', fontSize: 18 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Tickets: {trackerStats.todayTickets}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Time this week"
                value={formatTime(trackerStats.weekSeconds)}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#52c41a', fontSize: 18 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Tickets: {trackerStats.weekTickets}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Time this month"
                value={formatTime(trackerStats.monthSeconds)}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#722ed1', fontSize: 18 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Tickets: {trackerStats.monthTickets}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Tickets worked (variety)"
                value={trackerStats.monthTickets}
                suffix="this month"
                prefix={<FileTextOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
        </Row>


        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={
                <Space>
                  <ClockCircleOutlined />
                  <span>Active Tracker</span>
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              {activeTracker ? (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
                    <div>
                      <Text type="secondary">Ticket:</Text>
                      <br />
                      <Text
                        strong
                        style={{ cursor: 'pointer', color: '#1890ff' }}
                        onClick={() => router.push(`/tickets/${activeTracker.todo_id}`)}
                      >
                        {activeTracker.ticket?.title || `#${activeTracker.todo_id}`}
                      </Text>
                    </div>
                    <div>
                      <Text type="secondary">Elapsed:</Text>
                      <br />
                      <Text strong style={{ fontSize: 18 }}>{formatTime(elapsedSeconds)}</Text>
                    </div>
                    <Button
                      type="primary"
                      danger
                      icon={<StopOutlined />}
                      onClick={handleStopTracker}
                      loading={stopping}
                    >
                      Stop
                    </Button>
                    <Button
                      type="default"
                      onClick={() => router.push(`/tickets/${activeTracker.todo_id}`)}
                    >
                      Open Ticket
                    </Button>
                  </div>
                </Space>
              ) : (
                <Text type="secondary">No active time tracker. Start one from a ticket detail page.</Text>
              )}
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={8}>
            <Card
              title={
                <Space>
                  <ClockCircleOutlined />
                  <span>Recent Activities</span>
                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                    (Last trackers)
                  </Text>
                </Space>
              }
              style={{ height: '100%' }}
              loading={loadingTrackers}
            >
              {lastTrackers.length > 0 ? (
                <List
                  size="small"
                  dataSource={lastTrackers}
                  renderItem={(item) => (
                    <List.Item
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/tickets/${item.todo_id}`)}
                    >
                      <List.Item.Meta
                        avatar={<UserOutlined style={{ color: '#8c8c8c' }} />}
                        title={
                          <Space>
                            <Link
                              href={`/tickets/${item.todo_id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#1890ff', fontWeight: 600 }}
                            >
                              {item.ticket?.title || `Ticket #${item.todo_id}`}
                            </Link>
                            {!item.stop_time && (
                              <Text type="secondary" style={{ fontSize: 11 }}>(running)</Text>
                            )}
                          </Space>
                        }
                        description={
                          <Space size="small" split={<Text type="secondary">•</Text>}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(item.start_time).toLocaleString()}
                            </Text>
                            <Text style={{ fontSize: 12 }}>
                              {item.stop_time != null && item.duration_seconds != null
                                ? formatTime(item.duration_seconds)
                                : item.stop_time == null
                                  ? formatTime(
                                      Math.floor(
                                        (Date.now() - new Date(item.start_time).getTime()) / 1000
                                      )
                                    )
                                  : '—'}
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No time tracker sessions yet. Start tracking from a ticket detail page."
                />
              )}
            </Card>
          </Col>
       
          <Col xs={24} lg={8}>
            <Card
              title={
                <Space>
                  <ClockCircleOutlined />
                  <span>Time tracked - Last 7 days (minutes)</span>
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <RadarChart data={chartData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="short" />
                    <PolarRadiusAxis angle={90} domain={[0, 'auto']} tickFormatter={(v) => `${v}m`} />
                    <Radar name="Minutes" dataKey="duration" stroke="#1890ff" fill="#1890ff" fillOpacity={0.4} />
                    <Tooltip formatter={(value: number | undefined) => [`${value ?? 0} min`, 'Duration']} labelFormatter={(label) => chartData.find((d) => d.short === label)?.day ?? label} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="Account Information" style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">Email:</Text>
                  <br />
                  <Text strong>{user.email}</Text>
                </div>
                <div>
                  <Text type="secondary">User ID:</Text>
                  <br />
                  <Text code style={{ fontSize: 12 }}>
                    {user.id}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">Last Login:</Text>
                  <br />
                  <Text>
                    {new Date(user.last_sign_in_at || '').toLocaleString('en-US')}
                  </Text>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
        </Content>
      </Layout>
    </Layout>
  )
}

