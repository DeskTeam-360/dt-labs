'use client'

import { Form, Input, Button, Card, Typography, message, Alert } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import ThemeToggle from '@/components/ThemeToggle'

const { Title, Text } = Typography

interface LoginFormValues {
  email: string
  password: string
}

interface DbCheck {
  ok: boolean
  error?: string
  code?: string
  detail?: string
  hint?: string
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [dbError, setDbError] = useState<DbCheck | null>(null)
  const [sessionEndedReason, setSessionEndedReason] = useState(false)
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('reason')
      setSessionEndedReason(q === 'session_ended')
    } catch {
      setSessionEndedReason(false)
    }
  }, [])

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true)
    setDbError(null)
    try {
      const result = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      })

      if (result?.error) {
        try {
          const res = await fetch('/api/auth/check-db')
          const data = (await res.json()) as DbCheck
          setDbError(data.ok ? null : data)
        } catch {
          setDbError(null)
        }

        const msg = result.error === 'CredentialsSignin' || result.error === 'Configuration'
          ? 'Invalid email or password'
          : result.error
        message.error(msg)
        return
      }

      if (result?.ok) {
        message.success('Login successful!')
        // Full page navigation agar cookie session ikut terkirim (penting untuk Vercel/serverless)
        window.location.href = '/dashboard'
        return
      }
    } catch {
      try {
        const res = await fetch('/api/auth/check-db')
        const data = (await res.json()) as DbCheck
        setDbError(data.ok ? null : data)
      } catch {
        setDbError({
          ok: false,
          error: 'Could not reach database check endpoint. Is the dev server running?',
        })
      }
      message.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
        }}
      >
        <ThemeToggle variant="ghostOnDark" placement="bottomRight" />
      </div>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '20px',
        }}
      >
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 10px 40px rgba(0,0,0,0.1)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 8 }}>
            Login
          </Title>
          <Text type="secondary">
            Sign in to your account
          </Text>
        </div>

        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          {sessionEndedReason && (
            <Alert
              type="warning"
              showIcon
              message="Your session has ended"
              description="Your account was deactivated or removed. Sign in again if you still have access."
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter your email!' },
              { type: 'email', message: 'Invalid email!' }
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Please enter your password!' },
              { min: 6, message: 'Password must be at least 6 characters!' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{ height: 44 }}
            >
              Login
            </Button>
          </Form.Item>

      

          {dbError && !dbError.ok && (
            <Alert
              type="error"
              showIcon
              message="Cannot connect to database"
              description={
                <>
                  <Text strong>{dbError.error}</Text>
                  {dbError.code && <div>Code: {dbError.code}</div>}
                  {dbError.detail && <div>Detail: {dbError.detail}</div>}
                  {dbError.hint && <div style={{ marginTop: 8, color: '#fa8c16' }}>{dbError.hint}</div>}
                </>
              }
              style={{ marginTop: 16 }}
            />
          )}
        </Form>
      </Card>
      </div>
    </div>
  )
}
