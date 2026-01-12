'use client'

import { Layout, Card, Row, Col, Typography, Statistic, Space } from 'antd'
import { CheckCircleOutlined, FileTextOutlined, TeamOutlined, FolderOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { User } from '@supabase/supabase-js'
import AdminSidebar from './AdminSidebar'

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

export default function DashboardContent({ user, stats }: DashboardContentProps) {
  const [collapsed, setCollapsed] = useState(false)

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
                title="Completed Todos"
                value={stats.completedTodos}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Todos"
                value={stats.totalTodos}
                prefix={<FileTextOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={16}>
            <Card title="Recent Activities" style={{ height: '100%' }}>
              <div style={{ padding: '20px 0' }}>
                <Text type="secondary">
                  No recent activities. Start by creating new content!
                </Text>
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

