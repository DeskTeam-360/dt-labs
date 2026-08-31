'use client'

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Col, Descriptions, Empty, Input, Popconfirm, Row, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'

const { Text } = Typography

function isUrl(v: string) {
  try { const u = new URL(v.trim()); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}
function shortenUrl(v: string) {
  try {
    const u = new URL(v.trim())
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/$/, '')
    return path && path !== '/' ? `${host}${path.length > 28 ? path.slice(0, 28) + '…' : path}` : host
  } catch { return v }
}

interface Attr { id: string; meta_key: string; meta_value: string | null }

export default function TabCompanyAttributes({
  companyId,
  canEdit,
}: {
  companyId: string
  canEdit: boolean
}) {
  const [attrs, setAttrs] = useState<Attr[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/companies/${companyId}/attributes`, { credentials: 'include' })
    if (res.ok) { const j = await res.json(); setAttrs(j.data ?? []) }
    setLoading(false)
  }

  useEffect(() => { load() }, [companyId])

  const handleAdd = async () => {
    if (!newKey.trim()) return
    setSaving(true)
    const res = await fetch(`/api/companies/${companyId}/attributes`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta_key: newKey.trim(), meta_value: newVal.trim() || null }),
    })
    if (res.ok) { const row = await res.json(); setAttrs(p => [...p, row]); setNewKey(''); setNewVal('') }
    setSaving(false)
  }

  const handleUpdate = async (id: string) => {
    const res = await fetch(`/api/companies/${companyId}/attributes/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta_value: editVal || null }),
    })
    if (res.ok) {
      const row = await res.json()
      setAttrs(p => p.map(a => a.id === id ? { ...a, meta_value: row.meta_value } : a))
    }
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/companies/${companyId}/attributes/${id}`, { method: 'DELETE', credentials: 'include' })
    setAttrs(p => p.filter(a => a.id !== id))
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {canEdit && (
        <Row gutter={[16, 16]} align="bottom">
          <Col xs={24} sm={10}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Key <Text type="danger">*</Text></Text>
            <Input placeholder="e.g. contract_id" value={newKey} onChange={e => setNewKey(e.target.value)} onPressEnter={handleAdd} />
          </Col>
          <Col xs={24} sm={10}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Value</Text>
            <Input placeholder="e.g. CNT-001" value={newVal} onChange={e => setNewVal(e.target.value)} onPressEnter={handleAdd} />
          </Col>
          <Col xs={24} sm={4}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={saving} block style={{ height: 32 }}>
              Add
            </Button>
          </Col>
        </Row>
      )}

      {loading ? null : attrs.length === 0 ? (
        <Empty description="No custom attributes yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Descriptions column={1} bordered style={{ marginTop: 8 }}>
          {attrs.map(attr => (
            <Descriptions.Item
              key={attr.id}
              label={
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong>{attr.meta_key}</Text>
                  {canEdit && (
                    <Space>
                      {editing === attr.id ? (
                        <Button type="text" size="small" onClick={() => setEditing(null)}>Cancel</Button>
                      ) : (
                        <>
                          <Button
                            type="text" icon={<EditOutlined />} size="middle"
                            onClick={() => { setEditing(attr.id); setEditVal(attr.meta_value ?? '') }}
                          />
                          <Popconfirm title="Delete attribute?" onConfirm={() => handleDelete(attr.id)} okText="Yes" cancelText="No">
                            <Button danger icon={<DeleteOutlined />} size="middle" />
                          </Popconfirm>
                        </>
                      )}
                    </Space>
                  )}
                </Space>
              }
            >
              {editing === attr.id ? (
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onPressEnter={() => handleUpdate(attr.id)}
                    onBlur={() => handleUpdate(attr.id)}
                    autoFocus
                  />
                </Space.Compact>
              ) : attr.meta_value && isUrl(attr.meta_value) ? (
                <a href={attr.meta_value} target="_blank" rel="noopener noreferrer" title={attr.meta_value}>
                  {shortenUrl(attr.meta_value)}
                </a>
              ) : (
                <Text>{attr.meta_value ?? <Text type="secondary">(empty)</Text>}</Text>
              )}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
    </Space>
  )
}
