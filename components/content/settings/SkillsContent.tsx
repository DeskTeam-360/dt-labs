'use client'

import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Input, Layout, message, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

type Skill = { id: string; name: string; color: string }

export default function SkillsContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Skill | null>(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/skills', { credentials: 'include' })
      setSkills(res.ok ? ((await res.json()) as Skill[]) : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText)
    return data
  }

  const add = async () => {
    if (!newName.trim()) return
    try {
      await call('/api/skills', 'POST', { name: newName.trim() })
      setNewName('')
      await load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const rename = async () => {
    if (!editing || !editName.trim()) return
    try {
      await call(`/api/skills/${editing.id}`, 'PATCH', { name: editName.trim() })
      setEditing(null)
      await load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const remove = async (s: Skill) => {
    try {
      await call(`/api/skills/${s.id}`, 'DELETE')
      message.success('Skill deleted')
      await load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 800 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back to Settings</Button>
              </SpaNavLink>
              <Title level={2} style={{ margin: '8px 0 0' }}>Skills</Title>
              <Text type="secondary">
                The list of skills used on people, tickets and the default skills per company. Deleting a skill removes it everywhere it is used.
              </Text>
            </div>

            <Card size="small">
              <Flex gap={8}>
                <Input placeholder="New skill name" value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={() => void add()} maxLength={100} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => void add()}>Add skill</Button>
              </Flex>
            </Card>

            <Table<Skill>
              rowKey="id"
              size="middle"
              bordered
              loading={loading}
              dataSource={skills}
              pagination={{ defaultPageSize: 20, showSizeChanger: true }}
              columns={[
                { title: 'Skill', dataIndex: 'name', render: (v: string, s) => <Tag color={s.color}>{v}</Tag> },
                {
                  title: '',
                  key: 'actions',
                  width: 120,
                  align: 'right',
                  render: (_: unknown, s) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(s); setEditName(s.name) }} />
                      <Popconfirm title="Delete this skill?" description="It is removed from every person, ticket and company default." onConfirm={() => void remove(s)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>

          <Modal title="Rename skill" open={!!editing} onOk={() => void rename()} onCancel={() => setEditing(null)} okText="Save">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={() => void rename()} maxLength={100} />
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
