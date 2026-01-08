'use client'

import { Layout, Card, Descriptions, Avatar, Tag, Typography, Button, Space, Row, Col, Divider } from 'antd'
import { ArrowLeftOutlined, UserOutlined, MailOutlined, PhoneOutlined, BankOutlined, IdcardOutlined, GlobalOutlined, TranslationOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import AdminSidebar from './AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

interface UserDetailContentProps {
  user: User
  userData: any
}

export default function UserDetailContent({ user: currentUser, userData }: UserDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const getRoleColor = (role: string) => {
    const colorMap: Record<string, string> = {
      admin: 'red',
      manager: 'blue',
      user: 'green',
      guest: 'default',
    }
    return colorMap[role] || 'default'
  }

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      active: 'green',
      inactive: 'default',
      suspended: 'red',
      pending: 'orange',
    }
    return colorMap[status] || 'default'
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Space style={{ marginBottom: 24 }}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => router.push('/users')}
              >
                Back to Users
              </Button>
            </Space>

            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <Avatar
                size={120}
                icon={<UserOutlined />}
                src={userData.avatar_url}
                style={{ marginBottom: 16 }}
              />
              <div>
                <Title level={2} style={{ marginBottom: 8 }}>
                  {userData.full_name || 'N/A'}
                </Title>
                <Space size="middle">
                  <Tag color={getRoleColor(userData.role)} style={{ fontSize: 14, padding: '4px 12px' }}>
                    {userData.role?.toUpperCase()}
                  </Tag>
                  <Tag color={getStatusColor(userData.status)} style={{ fontSize: 14, padding: '4px 12px' }}>
                    {userData.status?.toUpperCase()}
                  </Tag>
                </Space>
              </div>
            </div>

            <Divider />

            <Row gutter={[24, 24]}>
              <Col xs={24} lg={12}>
                <Card title="Basic Information" size="small">
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Email">
                      <Space>
                        <MailOutlined />
                        <Text>{userData.email}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Full Name">
                      <Space>
                        <UserOutlined />
                        <Text>{userData.full_name || 'N/A'}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Phone">
                      <Space>
                        <PhoneOutlined />
                        <Text>{userData.phone || 'N/A'}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="User ID">
                      <Text code style={{ fontSize: 12 }}>
                        {userData.id}
                      </Text>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card title="Work Information" size="small">
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Department">
                      <Space>
                        <BankOutlined />
                        <Text>{userData.department || 'N/A'}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Position">
                      <Space>
                        <IdcardOutlined />
                        <Text>{userData.position || 'N/A'}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Timezone">
                      <Space>
                        <GlobalOutlined />
                        <Text>{userData.timezone || 'UTC'}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Locale">
                      <Space>
                        <TranslationOutlined />
                        <Text>{userData.locale || 'en'}</Text>
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col xs={24}>
                <Card title="Bio" size="small">
                  <Text>{userData.bio || 'No bio available'}</Text>
                </Card>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col xs={24} lg={12}>
                <Card title="Account Status" size="small">
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Email Verified">
                      <Tag color={userData.is_email_verified ? 'green' : 'red'}>
                        {userData.is_email_verified ? 'Yes' : 'No'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Role">
                      <Tag color={getRoleColor(userData.role)}>
                        {userData.role?.toUpperCase()}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Status">
                      <Tag color={getStatusColor(userData.status)}>
                        {userData.status?.toUpperCase()}
                      </Tag>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card title="Activity" size="small">
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Created At">
                      <Space>
                        <CalendarOutlined />
                        <Text>
                          {userData.created_at 
                            ? new Date(userData.created_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Updated">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.updated_at 
                            ? new Date(userData.updated_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Login">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.last_login_at 
                            ? new Date(userData.last_login_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Never'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Active">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.last_active_at 
                            ? new Date(userData.last_active_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}

