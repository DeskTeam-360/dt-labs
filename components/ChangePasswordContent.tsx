'use client'

import { Layout, Card, Form, Input, Button, Typography, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

interface ChangePasswordContentProps {
  user: User
}

export default function ChangePasswordContent({ user }: ChangePasswordContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const supabase = createClient()

  const onFinish = async (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('New password and confirm password do not match!')
      return
    }

    if (values.newPassword.length < 6) {
      message.error('New password must be at least 6 characters!')
      return
    }

    setLoading(true)
    try {
      // Update password
      const { error } = await supabase.auth.updateUser({
        password: values.newPassword
      })

      if (error) {
        message.error(error.message || 'Failed to change password')
        return
      }

      message.success('Password changed successfully!')
      form.resetFields()
    } catch (error) {
      message.error('An error occurred while changing password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Title level={2}>Change Password</Title>
            <Text type="secondary">Change your account password for better security</Text>

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              style={{ marginTop: 32 }}
            >
              <Form.Item
                name="currentPassword"
                label="Current Password"
                rules={[{ required: true, message: 'Current password is required!' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Current Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="newPassword"
                label="New Password"
                rules={[
                  { required: true, message: 'New password is required!' },
                  { min: 6, message: 'Password must be at least 6 characters!' }
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="New Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label="Confirm New Password"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Confirm password is required!' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Passwords do not match!'))
                    },
                  }),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Confirm New Password"
                  size="large"
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} size="large">
                  Change Password
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}

