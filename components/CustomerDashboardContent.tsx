'use client'

import { Layout, Card, Row, Col, Typography, Statistic, Spin } from 'antd'
import {
  CheckSquareOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import CustomerNavbar from './CustomerNavbar'
import dayjs from 'dayjs'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const { Content } = Layout
const { Title, Text } = Typography

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']

interface CustomerDashboardContentProps {
  user: User
  companyId: string
}

export default function CustomerDashboardContent({ user, companyId }: CustomerDashboardContentProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [totalTickets, setTotalTickets] = useState(0)
  const [myTicketsCount, setMyTicketsCount] = useState(0)
  const [timeSessions, setTimeSessions] = useState<Array<{ todo_id: number; start_time: string; stop_time: string | null; duration_seconds: number | null }>>([])
  const [ticketsByType, setTicketsByType] = useState<Array<{ type_title: string; type_id: number | null; count: number }>>([])

  const fetchStats = async () => {
    if (!companyId || !user?.id) return
    setLoading(true)
    try {
      // Total company tickets
      const { count: totalCount } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
      setTotalTickets(totalCount ?? 0)

      // My tickets: created by me or assigned to me
      const { data: myCreated } = await supabase
        .from('tickets')
        .select('id')
        .eq('company_id', companyId)
        .eq('created_by', user.id)
      const { data: assigneeRows } = await supabase
        .from('todo_assignees')
        .select('todo_id')
        .eq('user_id', user.id)
      const assignedIds = new Set((assigneeRows || []).map((r: any) => r.todo_id))
      const { data: myAssigned } = await supabase
        .from('tickets')
        .select('id')
        .eq('company_id', companyId)
        .in('id', Array.from(assignedIds))
      const myIds = new Set([
        ...(myCreated || []).map((t: any) => t.id),
        ...(myAssigned || []).map((t: any) => t.id),
      ])
      setMyTicketsCount(myIds.size)

      // Time tracker sessions for this user (tickets in company)
      const { data: trackerData } = await supabase
        .from('todo_time_tracker')
        .select('todo_id, start_time, stop_time, duration_seconds')
        .eq('user_id', user.id)
        .not('stop_time', 'is', null)
      const trackerList = trackerData || []
      const ticketIds = [...new Set(trackerList.map((t: any) => t.todo_id))]
      let companyTicketIds = new Set<number>()
      if (ticketIds.length > 0) {
        const { data: companyTickets } = await supabase
          .from('tickets')
          .select('id')
          .eq('company_id', companyId)
          .in('id', ticketIds)
        companyTicketIds = new Set((companyTickets || []).map((t: any) => t.id))
      }
      const filteredSessions = trackerList.filter((t: any) => companyTicketIds.has(t.todo_id))
      setTimeSessions(filteredSessions)

      // Tickets by type
      const { data: ticketsData } = await supabase
        .from('tickets')
        .select('type_id, type:ticket_types(id, title)')
        .eq('company_id', companyId)
      const typeCounts: Record<string, { type_title: string; type_id: number | null; count: number }> = {}
      ;(ticketsData || []).forEach((t: any) => {
        const key = t.type_id ?? 'none'
        const label = t.type?.title ?? 'No Type'
        if (!typeCounts[key]) typeCounts[key] = { type_title: label, type_id: t.type_id, count: 0 }
        typeCounts[key].count += 1
      })
      setTicketsByType(Object.values(typeCounts))
    } catch {
      setTotalTickets(0)
      setMyTicketsCount(0)
      setTimeSessions([])
      setTicketsByType([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [companyId, user?.id])

  const timeStats = useMemo(() => {
    const now = dayjs()
    const todayStart = now.startOf('day')
    const weekStart = now.subtract(7, 'day').startOf('day')
    const monthStart = now.subtract(30, 'day').startOf('day')
    let todaySec = 0
    let weekSec = 0
    let monthSec = 0
    timeSessions.forEach((s) => {
      const start = dayjs(s.start_time)
      const dur = s.duration_seconds ?? 0
      if (start.isAfter(todayStart)) todaySec += dur
      if (start.isAfter(weekStart)) weekSec += dur
      if (start.isAfter(monthStart)) monthSec += dur
    })
    return { todaySec, weekSec, monthSec }
  }, [timeSessions])

  const chartData = useMemo(() => {
    return ticketsByType.map((t, i) => ({
      name: t.type_title,
      value: t.count,
      fill: COLORS[i % COLORS.length],
    }))
  }, [ticketsByType])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <CustomerNavbar user={user} />
      <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>Dashboard</Title>
          <Text type="secondary">Summary of your activity and tickets</Text>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="My Tickets"
                    value={myTicketsCount}
                    prefix={<CheckSquareOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>Created by or assigned to me</Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="Time Today"
                    value={formatTime(timeStats.todaySec)}
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="Time This Week"
                    value={formatTime(timeStats.weekSec)}
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ color: '#722ed1' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card>
                  <Statistic
                    title="Time This Month"
                    value={formatTime(timeStats.monthSec)}
                    prefix={<ClockCircleOutlined />}
                    valueStyle={{ color: '#fa8c16' }}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
              <Col xs={24} lg={12}>
                <Card
                  title={
                    <span>
                      <FileTextOutlined style={{ marginRight: 8 }} />
                      Tickets by Type
                    </span>
                  }
                >
                  {chartData.length > 0 ? (
                    <div style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {chartData.map((_, index) => (
                              <Cell key={index} fill={chartData[index].fill} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Text type="secondary">No tickets yet</Text>
                    </div>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card
                  title="Total Company Tickets"
                  extra={
                    <Text type="secondary" style={{ fontSize: 12 }}>All tickets in company</Text>
                  }
                >
                  <Statistic
                    value={totalTickets}
                    prefix={<CheckSquareOutlined />}
                    valueStyle={{ fontSize: 48, color: '#1890ff' }}
                  />
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Content>
    </Layout>
  )
}
