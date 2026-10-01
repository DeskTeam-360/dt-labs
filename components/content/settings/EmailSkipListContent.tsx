'use client'

import { DeleteOutlined, StopOutlined } from '@ant-design/icons'
import { App, Button, Card, Flex, Input, Layout, Popconfirm, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

type HeldEmail = {
  id: string
  from_email: string | null
  to_email: string | null
  subject: string | null
  snippet: string | null
  synced_at: string | null
  reason: 'blocked' | 'unknown_ticket' | 'not_linked'
  referenced_ticket_id: number | null
}

type SkipEntry = { id: string; email: string; reason: string | null; created_at: string | null }

const REASON_TAG: Record<HeldEmail['reason'], { color: string; label: string; help: string }> = {
  blocked: { color: 'red', label: 'Blocked sender', help: 'The sender is on the blocklist, so sync ignored this email.' },
  unknown_ticket: {
    color: 'orange',
    label: 'Unknown ticket #',
    help: 'The subject referenced a ticket number that does not exist here (e.g. a Freshdesk forward). Emails like this now become new tickets.',
  },
  not_linked: { color: 'default', label: 'Not linked', help: 'Sync stored the email but did not attach it to a ticket.' },
}

interface EmailSkipListContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

export default function EmailSkipListContent({ user }: EmailSkipListContentProps) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)

  const [held, setHeld] = useState<HeldEmail[]>([])
  const [heldTotal, setHeldTotal] = useState(0)
  const [heldPage, setHeldPage] = useState(1)
  const [heldPageSize, setHeldPageSize] = useState(25)
  const [heldSearch, setHeldSearch] = useState('')
  const [heldLoading, setHeldLoading] = useState(true)

  const [skipList, setSkipList] = useState<SkipEntry[]>([])
  const [skipLoading, setSkipLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newReason, setNewReason] = useState('')
  const [adding, setAdding] = useState(false)

  const loadHeld = useCallback(async () => {
    setHeldLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(heldPageSize), offset: String((heldPage - 1) * heldPageSize) })
      if (heldSearch.trim()) params.set('search', heldSearch.trim())
      const res = await fetch(`/api/email/held?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load held emails')
      const body = (await res.json()) as { data: HeldEmail[]; total: number }
      setHeld(body.data ?? [])
      setHeldTotal(body.total ?? 0)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load held emails')
    } finally {
      setHeldLoading(false)
    }
  }, [heldPage, heldPageSize, heldSearch, message])

  const loadSkipList = useCallback(async () => {
    setSkipLoading(true)
    try {
      const res = await fetch('/api/email/skip-list', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load blocklist')
      setSkipList((await res.json()) as SkipEntry[])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load blocklist')
    } finally {
      setSkipLoading(false)
    }
  }, [message])

  useEffect(() => {
    loadHeld()
  }, [loadHeld])

  useEffect(() => {
    loadSkipList()
  }, [loadSkipList])

  const block = async (email: string, reason: string | null) => {
    const res = await fetch('/api/email/skip-list', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reason }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error || 'Failed to block')
  }

  const addEntry = async () => {
    setAdding(true)
    try {
      await block(newEmail, newReason || null)
      message.success(`${newEmail.trim().toLowerCase()} blocked`)
      setNewEmail('')
      setNewReason('')
      await Promise.all([loadSkipList(), loadHeld()])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to block')
    } finally {
      setAdding(false)
    }
  }

  const removeEntry = async (entry: SkipEntry) => {
    const res = await fetch(`/api/email/skip-list/${entry.id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      message.error('Failed to unblock')
      return
    }
    message.success(`${entry.email} unblocked`)
    await Promise.all([loadSkipList(), loadHeld()])
  }

  const heldTab = (
    <>
      <Paragraph type="secondary">
        Incoming emails that never became a ticket or a reply. Use this to spot mail that was blocked or lost.
      </Paragraph>
      <Input.Search
        allowClear
        placeholder="Search sender or subject"
        style={{ maxWidth: 360, marginBottom: 12 }}
        onSearch={(v) => {
          setHeldSearch(v)
          setHeldPage(1)
        }}
      />
      <Table<HeldEmail>
        rowKey="id"
        size="small"
        loading={heldLoading}
        dataSource={held}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: heldPage,
          pageSize: heldPageSize,
          total: heldTotal,
          showSizeChanger: true,
          pageSizeOptions: ['25', '50', '100'],
          showTotal: (t) => `${t} emails`,
          onChange: (p, ps) => {
            if (ps !== heldPageSize) {
              setHeldPageSize(ps)
              setHeldPage(1)
            } else {
              setHeldPage(p)
            }
          },
        }}
        locale={{ emptyText: 'No held emails' }}
        columns={[
          {
            title: 'Received',
            dataIndex: 'synced_at',
            width: 130,
            render: (iso: string | null) =>
              iso ? <span title={dayjs(iso).format('YYYY-MM-DD HH:mm')}>{dayjs(iso).fromNow()}</span> : '—',
          },
          { title: 'From', dataIndex: 'from_email', width: 240, render: (v: string | null) => v || '—' },
          {
            title: 'Subject',
            key: 'subject',
            render: (_, r) => (
              <div style={{ maxWidth: 520 }}>
                <div style={{ fontWeight: 500 }}>{r.subject || '(no subject)'}</div>
                {r.snippet && (
                  <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: r.snippet }}>
                    {r.snippet}
                  </Text>
                )}
              </div>
            ),
          },
          {
            title: 'Reason',
            key: 'reason',
            width: 180,
            render: (_, r) => (
              <Tooltip title={REASON_TAG[r.reason].help}>
                <Tag color={REASON_TAG[r.reason].color}>
                  {REASON_TAG[r.reason].label}
                  {r.referenced_ticket_id ? ` #${r.referenced_ticket_id}` : ''}
                </Tag>
              </Tooltip>
            ),
          },
          {
            title: '',
            key: 'actions',
            width: 130,
            render: (_, r) =>
              r.reason !== 'blocked' && r.from_email ? (
                <Popconfirm
                  title={`Block ${r.from_email}?`}
                  description="Future emails from this sender will be ignored."
                  okText="Block"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    try {
                      await block(r.from_email!, `Blocked from held email: ${r.subject ?? ''}`.slice(0, 500))
                      message.success(`${r.from_email} blocked`)
                      await Promise.all([loadSkipList(), loadHeld()])
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : 'Failed to block')
                    }
                  }}
                >
                  <Button size="small" icon={<StopOutlined />}>
                    Block sender
                  </Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />
    </>
  )

  const blocklistTab = (
    <>
      <Paragraph type="secondary">
        Emails from these senders are ignored by sync: no ticket, no reply. Unblocking only affects new emails.
      </Paragraph>
      <Flex gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
        <Input
          placeholder="sender@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onPressEnter={addEntry}
          style={{ width: 280 }}
        />
        <Input
          placeholder="Reason (optional)"
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          onPressEnter={addEntry}
          style={{ width: 320 }}
        />
        <Button type="primary" icon={<StopOutlined />} loading={adding} disabled={!newEmail.trim()} onClick={addEntry}>
          Block
        </Button>
      </Flex>
      <Table<SkipEntry>
        rowKey="id"
        size="small"
        loading={skipLoading}
        dataSource={skipList}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: 'No blocked senders' }}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Reason', dataIndex: 'reason', render: (v: string | null) => v || <Text type="secondary">—</Text> },
          {
            title: 'Added',
            dataIndex: 'created_at',
            width: 140,
            render: (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '—'),
          },
          {
            title: '',
            key: 'remove',
            width: 110,
            render: (_, r) => (
              <Popconfirm title={`Unblock ${r.email}?`} okText="Unblock" onConfirm={() => removeEntry(r)}>
                <Button size="small" danger icon={<DeleteOutlined />}>
                  Unblock
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </>
  )

  return (
    <Layout hasSider style={{ minHeight: '100dvh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: '32px 24px' }}>
          <Title level={2} style={{ marginBottom: 4 }}>
            Held &amp; blocked emails
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            See incoming emails that did not turn into tickets, and manage the sender blocklist.
          </Paragraph>
          <Card>
            <Tabs
              items={[
                { key: 'held', label: `Held emails${heldTotal ? ` (${heldTotal})` : ''}`, children: heldTab },
                { key: 'blocklist', label: `Blocklist (${skipList.length})`, children: blocklistTab },
              ]}
            />
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
