'use client'

import { useState } from 'react'
import { Card, Button, Input, Space, Typography, Alert, Spin } from 'antd'
import { ApiOutlined, SendOutlined } from '@ant-design/icons'
import type { User } from '@supabase/supabase-js'

const { Text } = Typography

type EndpointPreset = {
  label: string
  path: string
  method: 'GET'
  needId?: boolean
}

const PRESETS: EndpointPreset[] = [
  { label: 'View Account', path: 'account', method: 'GET' },
  { label: 'List Tickets', path: 'tickets', method: 'GET' },
  { label: 'Get Ticket by ID', path: 'tickets', method: 'GET', needId: true },
  { label: 'List Agents', path: 'agents', method: 'GET' },
  { label: 'List Contacts', path: 'contacts', method: 'GET' },
  { label: 'List Companies', path: 'companies', method: 'GET' },
  { label: 'List Groups', path: 'groups', method: 'GET' },
]

interface FreshdeskTestContentProps {
  user: User
}

export default function FreshdeskTestContent({ user }: FreshdeskTestContentProps) {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState('tickets')
  const [ticketId, setTicketId] = useState('')

  const callApi = async (path: string) => {
    setLoading(true)
    setError(null)
    setResponse(null)
    try {
      const url = `/api/freshdesk/${path}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || data?.message || `HTTP ${res.status}`)
        setResponse(JSON.stringify(data, null, 2))
        return
      }
      setResponse(JSON.stringify(data, null, 2))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      setError(msg)
      setResponse(null)
    } finally {
      setLoading(false)
    }
  }

  const handlePreset = (preset: EndpointPreset) => {
    const path = preset.needId && ticketId ? `${preset.path}/${ticketId}` : preset.path
    setSelectedPath(path)
    callApi(path)
  }

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>Freshdesk API Test</span>
          </Space>
        }
        extra={
          <Text type="secondary">
            Key & domain dari env (FRESHDESK_API_KEY, FRESHDESK_DOMAIN)
          </Text>
        }
      >
        <Alert
          type="info"
          showIcon
          message="Testing Freshdesk API v2 via proxy. Pastikan FRESHDESK_DOMAIN dan FRESHDESK_API_KEY sudah diisi di .env.local."
          style={{ marginBottom: 16 }}
        />

        <Space wrap size="middle" style={{ marginBottom: 16 }}>
          {PRESETS.map((preset) => (
            <Button
              key={preset.path + (preset.needId ? '-id' : '')}
              icon={<SendOutlined />}
              onClick={() => handlePreset(preset)}
              loading={loading}
            >
              {preset.label}
            </Button>
          ))}
        </Space>

        {PRESETS.some((p) => p.needId) && (
          <Space style={{ marginBottom: 16 }}>
            <Text>Ticket ID (untuk Get Ticket by ID):</Text>
            <Input
              placeholder="e.g. 1"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              style={{ width: 120 }}
            />
          </Space>
        )}

        {loading && (
          <div style={{ marginTop: 16 }}>
            <Spin tip="Memanggil Freshdesk API..." />
          </div>
        )}

        {error && (
          <Alert type="error" message={error} style={{ marginTop: 16 }} />
        )}

        {response && !loading && (
          <Card size="small" title="Response" style={{ marginTop: 16 }}>
            <pre
              style={{
                background: '#f5f5f5',
                padding: 16,
                borderRadius: 8,
                overflow: 'auto',
                maxHeight: 400,
                fontSize: 12,
              }}
            >
              <code>{response}</code>
            </pre>
          </Card>
        )}
      </Card>
    </div>
  )
}
