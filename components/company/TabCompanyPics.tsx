'use client'

import { DeleteOutlined } from '@ant-design/icons'
import { Alert, Button, Flex, message, Popconfirm, Select, Table, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'

const { Text } = Typography

type Pic = { user_id: string; full_name: string | null; email: string; role: 'primary' | 'secondary' }
type Candidate = { id: string; full_name: string | null; email: string }

/**
 * People in charge (PIC) of this company: any number, one of them primary and the rest secondary.
 * They are picked from the company's customer users.
 */
export default function TabCompanyPics({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [pics, setPics] = useState<Pic[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch(`/api/companies/${companyId}/pics`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { pics: [] })),
      fetch(`/api/companies/${companyId}/users`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { users: [] })),
    ])
      .then(([p, u]) => {
        if (cancelled) return
        setPics((p as { pics?: Pic[] }).pics ?? [])
        setCandidates((u as { users?: Candidate[] }).users ?? [])
      })
      .catch(() => {
        if (!cancelled) {
          setPics([])
          setCandidates([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId])

  const save = async (next: Pic[]) => {
    const previous = pics
    setPics(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/pics`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pics: next.map((p) => ({ user_id: p.user_id, role: p.role })) }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Failed to save PIC')
    } catch (e) {
      setPics(previous)
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const add = (id: string) => {
    const c = candidates.find((x) => x.id === id)
    if (!c) return
    // The first PIC of a company is the primary one.
    void save([...pics, { user_id: c.id, full_name: c.full_name, email: c.email, role: pics.some((p) => p.role === 'primary') ? 'secondary' : 'primary' }])
  }

  // Making someone primary moves the previous primary to secondary.
  const makePrimary = (id: string) => void save(pics.map((p) => ({ ...p, role: p.user_id === id ? 'primary' : 'secondary' })))

  const taken = new Set(pics.map((p) => p.user_id))
  const addable = candidates.filter((c) => !taken.has(c.id))
  const sorted = [...pics].sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1))

  return (
    <Flex vertical gap={16} style={{ maxWidth: 760 }}>
      <Text type="secondary">The people in charge on the customer side. One primary PIC and any number of secondary PICs.</Text>
      {canEdit ? (
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={addable.length ? 'Add a PIC…' : candidates.length ? 'Everyone is already a PIC' : 'This company has no users yet'}
          style={{ width: 320 }}
          disabled={loading || saving || addable.length === 0}
          value={null}
          options={addable.map((c) => ({ value: c.id, label: c.full_name ? `${c.full_name} (${c.email})` : c.email }))}
          onSelect={(id: string | null) => {
            if (id) add(id)
          }}
        />
      ) : null}
      {!loading && pics.length > 0 && !pics.some((p) => p.role === 'primary') ? <Alert type="warning" showIcon title="No primary PIC yet" /> : null}
      <Table<Pic>
        size="middle"
        rowKey="user_id"
        loading={loading}
        dataSource={sorted}
        pagination={false}
        locale={{ emptyText: 'No PIC yet' }}
        columns={[
          { title: 'Name', dataIndex: 'full_name', render: (v: string | null, r) => v || r.email },
          { title: 'Email', dataIndex: 'email' },
          {
            title: 'Role',
            dataIndex: 'role',
            width: 190,
            render: (v: string, r) =>
              v === 'primary' ? (
                <Tag color="blue" style={{ margin: 0 }}>Primary</Tag>
              ) : (
                <Flex gap={8} align="center">
                  <Tag style={{ margin: 0 }}>Secondary</Tag>
                  {canEdit ? (
                    <Button type="link" size="small" style={{ padding: 0 }} disabled={saving} onClick={() => makePrimary(r.user_id)}>
                      Make primary
                    </Button>
                  ) : null}
                </Flex>
              ),
          },
          ...(canEdit
            ? [
                {
                  title: '',
                  key: 'x',
                  width: 60,
                  render: (_: unknown, r: Pic) => (
                    <Popconfirm title="Remove this PIC?" okText="Remove" onConfirm={() => void save(pics.filter((p) => p.user_id !== r.user_id))}>
                      <Button size="small" danger icon={<DeleteOutlined />} disabled={saving} />
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Flex>
  )
}
