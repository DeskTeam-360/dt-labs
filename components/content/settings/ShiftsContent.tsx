'use client'

import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import { Alert, Button, Flex, Form, Input, Layout, message, Modal, Popconfirm, Select, Space, Table, Tag, TimePicker, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

type Shift = {
  id: string
  title: string
  start: string
  end: string
  crosses_midnight: boolean
  description: string | null
  people: number
}

type Person = { id: string; name: string; position: string | null; shift_id: string | null }

type FormValues = { title: string; start: Dayjs; end: Dayjs; description?: string }

const toTime = (hhmm: string) => dayjs(`2000-01-01 ${hhmm}`)

export default function ShiftsContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const [people, setPeople] = useState<Person[]>([])
  const [addTo, setAddTo] = useState<Shift | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' })
      const list = res.ok ? ((await res.json()) as { id: string; full_name?: string | null; email: string; position?: string | null; role?: string | null; status?: string | null; shift_id?: string | null }[]) : []
      setPeople(
        (Array.isArray(list) ? list : [])
          .filter((u) => ['admin', 'manager', 'staff'].includes((u.role ?? '').toLowerCase()) && (u.status ?? 'active') === 'active')
          .map((u) => ({ id: u.id, name: u.full_name || u.email, position: u.position ?? null, shift_id: u.shift_id ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    } catch {
      setPeople([])
    }
  }, [])

  const shiftTitle = (id: string | null) => rows.find((r) => r.id === id)?.title ?? null
  const membersOf = (id: string) => people.filter((p) => p.shift_id === id)

  /** People picked who are on a different shift today: they will be moved. */
  const willMove = people.filter((p) => picked.includes(p.id) && p.shift_id && p.shift_id !== addTo?.id)

  const openAdd = (sh: Shift) => {
    setAddTo(sh)
    setPicked([])
  }

  const addPeople = async () => {
    if (!addTo || picked.length === 0) return
    setAdding(true)
    try {
      const data = (await call(`/api/shifts/${addTo.id}/members`, 'POST', { user_ids: picked })) as { added: number; moved: { name: string; from_shift: string }[] }
      message.success(
        data.moved.length > 0
          ? `${data.added} added to ${addTo.title}. Moved: ${data.moved.map((m) => `${m.name} (from ${m.from_shift})`).join(', ')}`
          : `${data.added} added to ${addTo.title}`
      )
      setAddTo(null)
      await Promise.all([load(), loadPeople()])
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const removePerson = async (sh: Shift, p: Person) => {
    try {
      await call(`/api/shifts/${sh.id}/members?user_id=${p.id}`, 'DELETE')
      message.success(`${p.name} removed from ${sh.title}`)
      await Promise.all([load(), loadPeople()])
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shifts', { credentials: 'include' })
      setRows(res.ok ? ((await res.json()) as Shift[]) : [])
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

  const openForm = (s: Shift | null) => {
    setEditing(s)
    form.resetFields()
    if (s) form.setFieldsValue({ title: s.title, start: toTime(s.start), end: toTime(s.end), description: s.description ?? '' })
    setOpen(true)
  }

  const submit = async (v: FormValues) => {
    setSaving(true)
    try {
      const body = { title: v.title, start: v.start.format('HH:mm'), end: v.end.format('HH:mm'), description: v.description ?? '' }
      if (editing) await call(`/api/shifts/${editing.id}`, 'PUT', body)
      else await call('/api/shifts', 'POST', body)
      message.success('Shift saved')
      setOpen(false)
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: Shift) => {
    try {
      await call(`/api/shifts/${s.id}`, 'DELETE')
      message.success('Shift deleted')
      await load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 960 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back to Settings</Button>
              </SpaNavLink>
              <Title level={2} style={{ margin: '8px 0 0' }}>Shifts</Title>
              <Text type="secondary">
                The shifts people can be placed on. Pick a person&apos;s shift on their User Detail page. All times are WIB (Asia/Jakarta).
              </Text>
            </div>

            <Alert
              type="info"
              showIcon
              title="A shift that ends earlier than it starts runs past midnight"
              description="For example 23:00 to 07:00 is a night shift that finishes the next morning."
            />

            <div>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>Add shift</Button>
            </div>

            <Table<Shift>
              rowKey="id"
              size="middle"
              bordered
              loading={loading}
              dataSource={rows}
              pagination={false}
              expandable={{
                rowExpandable: (r) => membersOf(r.id).length > 0,
                expandedRowRender: (r) => (
                  <Flex gap={6} wrap>
                    {membersOf(r.id).map((m) => (
                      <Tag key={m.id} closable onClose={(e) => { e.preventDefault(); void removePerson(r, m) }} style={{ margin: 0 }}>
                        {m.name}{m.position ? ` - ${m.position}` : ''}
                      </Tag>
                    ))}
                  </Flex>
                ),
              }}
              locale={{ emptyText: 'No shifts yet. Add the first one.' }}
              columns={[
                { title: 'Title', dataIndex: 'title', width: 200, render: (v: string) => <Text strong>{v}</Text> },
                { title: 'Start (WIB)', dataIndex: 'start', width: 120, align: 'center' },
                {
                  title: 'End (WIB)',
                  dataIndex: 'end',
                  width: 150,
                  align: 'center',
                  render: (v: string, r) => (
                    <Space size={6}>
                      {v}
                      {r.crosses_midnight ? <Tag color="purple" style={{ margin: 0 }}>next day</Tag> : null}
                    </Space>
                  ),
                },
                { title: 'Description', dataIndex: 'description', render: (v: string | null) => v || <Text type="secondary">—</Text> },
                { title: 'People', dataIndex: 'people', width: 90, align: 'center' },
                {
                  title: '',
                  key: 'actions',
                  width: 140,
                  align: 'right',
                  render: (_: unknown, r) => (
                    <Space>
                      <Button size="small" icon={<UserAddOutlined />} onClick={() => openAdd(r)} title="Add people" />
                      <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} />
                      <Popconfirm
                        title="Delete this shift?"
                        description={r.people > 0 ? `${r.people} people will be left without a shift.` : undefined}
                        okText="Delete"
                        onConfirm={() => void remove(r)}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>

          <Modal
            title={addTo ? `Add people to ${addTo.title}` : 'Add people'}
            open={!!addTo}
            onCancel={() => setAddTo(null)}
            onOk={() => void addPeople()}
            okText={willMove.length > 0 ? `Add and move ${willMove.length}` : 'Add'}
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
                  .filter((p) => p.shift_id !== addTo?.id)
                  .map((p) => ({ value: p.id, label: p.position ? `${p.name} - ${p.position}` : p.name, person: p }))}
                optionRender={(o) => {
                  const p = (o.data as { person: Person }).person
                  const cur = shiftTitle(p.shift_id)
                  return (
                    <Flex justify="space-between" align="center" gap={8}>
                      <span>{p.position ? `${p.name} - ${p.position}` : p.name}</span>
                      {cur ? <Tag color="geekblue" style={{ margin: 0 }}>{cur}</Tag> : <Text type="secondary" style={{ fontSize: 12 }}>no shift</Text>}
                    </Flex>
                  )
                }}
              />
              {willMove.length > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  title={`${willMove.length} ${willMove.length === 1 ? 'person is' : 'people are'} on another shift and will be moved`}
                  description={willMove.map((p) => `${p.name} (${shiftTitle(p.shift_id)} to ${addTo?.title})`).join(', ')}
                />
              ) : null}
            </Space>
          </Modal>

          <Modal
            title={editing ? 'Edit shift' : 'Add shift'}
            open={open}
            onCancel={() => setOpen(false)}
            onOk={() => form.submit()}
            okText="Save"
            confirmLoading={saving}
            destroyOnHidden
          >
            <Form form={form} layout="vertical" onFinish={submit}>
              <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Enter a title' }]}>
                <Input maxLength={100} placeholder="e.g. Morning, Night" />
              </Form.Item>
              <Space size={16} style={{ display: 'flex' }}>
                <Form.Item name="start" label="Start (WIB)" rules={[{ required: true, message: 'Pick the start time' }]}>
                  <TimePicker format="HH:mm" minuteStep={5} needConfirm={false} />
                </Form.Item>
                <Form.Item name="end" label="End (WIB)" rules={[{ required: true, message: 'Pick the end time' }]}>
                  <TimePicker format="HH:mm" minuteStep={5} needConfirm={false} />
                </Form.Item>
              </Space>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Optional" />
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

