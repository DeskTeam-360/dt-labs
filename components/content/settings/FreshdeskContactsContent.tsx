'use client'

import { Button, Table, Tag, Typography } from 'antd'
import { useState } from 'react'

const { Title, Text } = Typography

type Contact = {
  id: number
  name: string
  email: string | null
  phone: string | null
  created_at: string
}

export default function FreshdeskContactsContent() {
  const [loading, setLoading] = useState(false)
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [totalFetched, setTotalFetched] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/freshdesk/contacts-no-company', { credentials: 'include' })
      if (!res.ok) {
        const text = await res.text()
        setError(`HTTP ${res.status} — ${text.slice(0, 200)}`)
        return
      }
      const body = await res.json()
      setContacts(body.no_company ?? [])
      setTotalFetched(body.total_fetched ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <Title level={4}>Freshdesk Contacts — No Company</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Fetch all contacts dari Freshdesk dan tampilkan yang belum punya company.
      </Text>

      <Button type="primary" loading={loading} onClick={load} style={{ marginBottom: 24 }}>
        {contacts === null ? 'Fetch Contacts' : 'Refresh'}
      </Button>

      {error && <Text type="danger" style={{ display: 'block', marginBottom: 16 }}>{error}</Text>}

      {contacts !== null && (
        <>
          <Text style={{ display: 'block', marginBottom: 12 }}>
            Total fetched dari Freshdesk: <b>{totalFetched}</b> &nbsp;|&nbsp;
            Tanpa company: <Tag color="red">{contacts.length}</Tag>
          </Text>
          <Table<Contact>
            rowKey="id"
            dataSource={contacts}
            size="small"
            pagination={{ pageSize: 50, showSizeChanger: false, showTotal: (t) => `${t} contacts` }}
            locale={{ emptyText: 'Semua contact sudah punya company' }}
            columns={[
              { title: 'FD ID', dataIndex: 'id', width: 90 },
              { title: 'Name', dataIndex: 'name', ellipsis: true },
              { title: 'Email', dataIndex: 'email', ellipsis: true, render: (v) => v ?? '—' },
              { title: 'Phone', dataIndex: 'phone', width: 140, render: (v) => v ?? '—' },
              {
                title: 'Created',
                dataIndex: 'created_at',
                width: 120,
                render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
              },
            ]}
          />
        </>
      )}
    </div>
  )
}
