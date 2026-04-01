'use client'

import { Layout, Table, Button, Typography, Card, message, Switch, Space, Tag } from 'antd'
import { EditOutlined, FileTextOutlined } from '@ant-design/icons'
import { useState, useEffect, useCallback } from 'react'
import AdminSidebar from './AdminSidebar'
import { SpaNavLink } from './SpaNavLink'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title, Text } = Typography

interface MessageTemplatesContentProps {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null }; role?: string }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export interface MessageTemplateRow {
  id: string
  type: string
  group: string
  title: string
  key: string
  status: string
  content: string | null
  created_at: string
  updated_at: string
}

export default function MessageTemplatesContent({ user: currentUser }: MessageTemplatesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<MessageTemplateRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<MessageTemplateRow[]>('/api/message-templates')
      setRows(data || [])
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleStatus = async (r: MessageTemplateRow, active: boolean) => {
    const next = active ? 'active' : 'inactive'
    try {
      const updated = await apiFetch<MessageTemplateRow>(`/api/message-templates/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      message.success(active ? 'Activated' : 'Deactivated')
    } catch (e: unknown) {
      message.error((e as Error).message || 'Update failed')
    }
  }

  const columns: ColumnsType<MessageTemplateRow> = [
    {
      title: 'Group',
      dataIndex: 'group',
      key: 'group',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: 260,
      ellipsis: true,
      render: (k: string) => (
        <Text copyable={{ text: k }} style={{ fontSize: 12 }}>
          {k}
        </Text>
      ),
    },
    {
      title: 'Content',
      key: 'has_content',
      width: 100,
      render: (_: unknown, r) => (r.content && r.content.trim() ? <Tag color="green">Set</Tag> : <Tag>Empty</Tag>),
    },
    {
      title: 'Active',
      key: 'status',
      width: 100,
      render: (_: unknown, r) => (
        <Switch checked={r.status === 'active'} onChange={(c) => void toggleStatus(r, c)} />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, r) => (
        <SpaNavLink
          href={`/message-templates/${r.id}/edit`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <EditOutlined />
          Edit
        </SpaNavLink>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ margin: 24 }}>
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space align="center">
                <FileTextOutlined style={{ fontSize: 22 }} />
                <Title level={4} style={{ margin: 0 }}>
                  Message templates
                </Title>
              </Space>
              <Text type="secondary">
                Pre-seeded templates only — edit the body on a separate page and toggle Active here. You cannot add or
                delete rows. Use the <strong>key</strong> in code when wiring automation or email.
              </Text>
              <Table<MessageTemplateRow>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={rows}
                pagination={{ pageSize: 50, showSizeChanger: true }}
                scroll={{ x: 1100 }}
              />
            </Space>
          </Card>
        </Content>
      </Layout>

    </Layout>
  )
}
