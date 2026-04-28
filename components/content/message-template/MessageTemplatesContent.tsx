'use client'

import { EditOutlined, EyeOutlined, FileTextOutlined } from '@ant-design/icons'
import { Button, Card, Layout, message, Space, Switch, Table, Tabs,Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo,useState } from 'react'

import { shouldOpenHrefInNewTab } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import MessageTemplatePreviewModal from '@/components/message-template/MessageTemplatePreviewModal'

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
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<MessageTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [previewRow, setPreviewRow] = useState<MessageTemplateRow | null>(null)
  const [activeGroup, setActiveGroup] = useState<string>('')

  const groupsInOrder = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    for (const r of rows) {
      const g = r.group || '—'
      if (!seen.has(g)) {
        seen.add(g)
        order.push(g)
      }
    }
    return order
  }, [rows])

  const resolvedGroup = useMemo(() => {
    if (groupsInOrder.length === 0) return ''
    if (activeGroup && groupsInOrder.includes(activeGroup)) return activeGroup
    return groupsInOrder[0]
  }, [groupsInOrder, activeGroup])

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
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
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
        <Switch
          checked={r.status === 'active'}
          disabled={r.status !== 'active'}
          onChange={(c) => void toggleStatus(r, c)}
        />
      ),
    },
    {
      title: 'Action',
      key: 'actions',
      width: 200,
      render: (_: unknown, r) => {
        const editHref = `/settings/message-templates/${r.id}/edit`
        const isInactive = r.status !== 'active'
        return (
          <Space>
            <Button
              type="primary"
              icon={<EyeOutlined />}
              disabled={isInactive}
              onClick={() => setPreviewRow(r)}
            >
              Preview
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              disabled={isInactive}
              href={editHref}
              onClick={(e) => {
                if (isInactive) {
                  e.preventDefault()
                  return
                }
                if (shouldOpenHrefInNewTab(e)) return
                if (e.button !== 0) return
                e.preventDefault()
                router.push(editHref)
              }}
            >
              Edit
            </Button>
          </Space>
        )
      },
    },
  ]

  const tabItems = useMemo(
    () =>
      groupsInOrder.map((g) => ({
        key: g,
        label: <span title={g}>{g}</span>,
      })),
    [groupsInOrder],
  )

  const filteredRows = useMemo(
    () => (resolvedGroup ? rows.filter((r) => (r.group || '—') === resolvedGroup) : []),
    [rows, resolvedGroup],
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ margin: 24 }}>
        
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space align="center">
                <FileTextOutlined style={{ fontSize: 22 }} />
                <Title level={4} style={{ margin: 0 }}>
                  Message templates
                </Title>
              </Space>
              <Text type="secondary">
                Pre-seeded templates only — edit the body on a separate page and toggle Active here. You cannot add or
                delete rows. Use the <strong>key</strong> in code when wiring automation or email. Templates are grouped
                by <strong>Group</strong> in the tabs below.
              </Text>
              {groupsInOrder.length > 0 ? (
                <>
                  <Tabs
                    activeKey={resolvedGroup}
                    onChange={setActiveGroup}
                    items={tabItems}
                    type="card"
                    style={{ marginBottom: 0 }}
                  />
                  <Table<MessageTemplateRow>
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={filteredRows}
                    pagination={{ pageSize: 50, showSizeChanger: true }}
                    scroll={{ x: 960 }}
                  />
                </>
              ) : (
                <Table<MessageTemplateRow>
                  rowKey="id"
                  loading={loading}
                  columns={columns}
                  dataSource={[]}
                  pagination={false}
                />
              )}
            </Space>
          
        </Content>
      </AdminMainColumn>

      <MessageTemplatePreviewModal
        open={!!previewRow}
        onClose={() => setPreviewRow(null)}
        templateBody={previewRow?.content ?? ''}
        title={previewRow ? `Preview: ${previewRow.title}` : 'Preview (sample data)'}
      />
    </Layout>
  )
}
