'use client'

import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Input, InputNumber, Layout, message, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

type Skill = { id: string; name: string; color: string }
type Person = { id: string; name: string; position: string | null }
type Member = { user_id: string; level: number }

const LEVEL_GUIDE = '1-3: just learning · 4-6: can do it with some help · 7-8: works independently · 9-10: can teach others'

export default function SkillsContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Skill | null>(null)
  const [editName, setEditName] = useState('')
  const isAdminUser = (user.role ?? '').toLowerCase() === 'admin'
  const [people, setPeople] = useState<Person[]>([])
  const [members, setMembers] = useState<Record<string, Member[]>>({})
  const [addTo, setAddTo] = useState<Skill | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [level, setLevel] = useState<number>(5)
  const [adding, setAdding] = useState(false)

  const loadPeople = useCallback(async () => {
    try {
      const [uRes, mRes] = await Promise.all([
        fetch('/api/users', { credentials: 'include' }),
        fetch('/api/skills/members', { credentials: 'include' }),
      ])
      const list = uRes.ok ? ((await uRes.json()) as { id: string; full_name?: string | null; email: string; position?: string | null; role?: string | null; status?: string | null }[]) : []
      setPeople(
        (Array.isArray(list) ? list : [])
          .filter((u) => ['admin', 'manager', 'staff'].includes((u.role ?? '').toLowerCase()) && (u.status ?? 'active') === 'active')
          .map((u) => ({ id: u.id, name: u.full_name || u.email, position: u.position ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setMembers(mRes.ok ? ((await mRes.json()) as Record<string, Member[]>) : {})
    } catch {
      setPeople([])
      setMembers({})
    }
  }, [])

  const personById = new Map(people.map((p) => [p.id, p]))
  const membersOf = (id: string) => (members[id] ?? []).filter((m) => personById.has(m.user_id)).sort((a, b) => b.level - a.level)

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
    void loadPeople()
  }, [load, loadPeople])

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
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

  const openAdd = (sk: Skill) => {
    setAddTo(sk)
    setPicked([])
    setLevel(5)
  }

  const addPeople = async () => {
    if (!addTo || picked.length === 0) return
    setAdding(true)
    try {
      const data = (await call(`/api/skills/${addTo.id}/members`, 'POST', { user_ids: picked, level })) as { added: number; skipped?: number }
      message.success(`${data.added} added to ${addTo.name} at level ${level}${data.skipped ? `. ${data.skipped} already had it.` : ''}`)
      setAddTo(null)
      await loadPeople()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const removePerson = async (sk: Skill, personId: string) => {
    try {
      await call(`/api/skills/${sk.id}/members?user_id=${personId}`, 'DELETE')
      await loadPeople()
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
              expandable={{
                rowExpandable: (r) => membersOf(r.id).length > 0,
                expandedRowRender: (r) => (
                  <Flex gap={6} wrap>
                    {membersOf(r.id).map((m) => (
                      <Tag
                        key={m.user_id}
                        closable={isAdminUser}
                        onClose={(e) => {
                          e.preventDefault()
                          void removePerson(r, m.user_id)
                        }}
                        style={{ margin: 0 }}
                      >
                        {personById.get(m.user_id)?.name} · {m.level}/10
                      </Tag>
                    ))}
                  </Flex>
                ),
              }}
              columns={[
                { title: 'Skill', dataIndex: 'name', render: (v: string, s) => <Tag color={s.color}>{v}</Tag> },
                { title: 'People', key: 'people', width: 90, align: 'center', render: (_: unknown, s) => membersOf(s.id).length },
                {
                  title: '',
                  key: 'actions',
                  width: 150,
                  align: 'right',
                  render: (_: unknown, s) => (
                    <Space>
                      {isAdminUser ? <Button size="small" icon={<UserAddOutlined />} onClick={() => openAdd(s)} title="Add people" /> : null}
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

          <Modal
            title={addTo ? `Add people to ${addTo.name}` : 'Add people'}
            open={!!addTo}
            onCancel={() => setAddTo(null)}
            onOk={() => void addPeople()}
            okText="Add"
            okButtonProps={{ disabled: picked.length === 0 }}
            confirmLoading={adding}
            destroyOnHidden
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Select
                mode="multiple"
                showSearch
                allowClear
                autoFocus
                optionFilterProp="label"
                placeholder="Pick people"
                style={{ width: '100%' }}
                value={picked}
                onChange={setPicked}
                options={people
                  .filter((p) => !(members[addTo?.id ?? ''] ?? []).some((m) => m.user_id === p.id))
                  .map((p) => ({ value: p.id, label: p.position ? `${p.name} - ${p.position}` : p.name }))}
              />
              <Flex align="center" gap={8}>
                <Tooltip title={LEVEL_GUIDE}>
                  <Text style={{ cursor: 'help' }}>Level for everyone added</Text>
                </Tooltip>
                <InputNumber min={1} max={10} precision={0} value={level} onChange={(v) => setLevel(Number(v) || 5)} style={{ width: 80 }} />
                <Text type="secondary">/ 10</Text>
              </Flex>
              <Text type="secondary" style={{ fontSize: 12 }}>
                People who already have this skill are not listed and keep their level. Change a single level on the person&apos;s User Detail page.
              </Text>
            </Space>
          </Modal>

          <Modal title="Rename skill" open={!!editing} onOk={() => void rename()} onCancel={() => setEditing(null)} okText="Save">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={() => void rename()} maxLength={100} />
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
