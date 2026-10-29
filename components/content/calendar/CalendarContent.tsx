'use client'

import { DeleteOutlined, EditOutlined, GoogleOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Badge, Button, Calendar, Card, Checkbox, DatePicker, Flex, Form, Input, Layout, message, Modal, Popconfirm, Segmented, Select, Space, Switch, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { CALENDAR_EVENT_TYPES, CALENDAR_TYPE_META, type CalendarEventOut, type CalendarEventType } from '@/lib/calendar-events'

const { Content } = Layout
const { Title, Text } = Typography

type CalTicket = { id: number; title: string; due_date: string | null; status: string; priority: number | null; company_name: string | null }
type CalHoliday = { date: string; name: string }
type Person = { id: string; label: string }

type FormValues = {
  type: CalendarEventType
  title: string
  user_id?: string
  range: [Dayjs, Dayjs]
  repeat_yearly: boolean
  notes?: string
}

const DONE_STATUSES = ['closed', 'resolved', 'done', 'completed']
const MAX_IN_CELL = 3
const NEEDS_PERSON: CalendarEventType[] = ['birthday', 'leave', 'duty']

/**
 * The team calendar: birthdays, holidays, leave (cuti), duty (piket) and other events that are entered here,
 * together with the tickets that are due. Tickets and entries can be switched on and off.
 */
export default function CalendarContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [month, setMonth] = useState<Dayjs>(dayjs())
  const [selected, setSelected] = useState<Dayjs>(dayjs())
  const [tickets, setTickets] = useState<CalTicket[]>([])
  const [holidays, setHolidays] = useState<CalHoliday[]>([])
  const [events, setEvents] = useState<CalendarEventOut[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState<string[]>(['tickets', ...CALENDAR_EVENT_TYPES])
  const [people, setPeople] = useState<Person[]>([])
  const [editing, setEditing] = useState<CalendarEventOut | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [google, setGoogle] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [pushing, setPushing] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const formType = Form.useWatch('type', form)

  // The month grid also shows days of the neighbouring months, so load a little around it.
  const from = month.startOf('month').subtract(7, 'day').format('YYYY-MM-DD')
  const to = month.endOf('month').add(7, 'day').format('YYYY-MM-DD')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/calendar?from=${from}&to=${to}&scope=${scope}`, { credentials: 'include' })
      .then(async (r) => {
        const j = (await r.json()) as { tickets?: CalTicket[]; holidays?: CalHoliday[]; events?: CalendarEventOut[]; can_edit?: boolean; error?: string }
        if (!r.ok) throw new Error(j.error || 'Failed to load the calendar')
        if (cancelled) return
        setTickets(j.tickets ?? [])
        setHolidays(j.holidays ?? [])
        setEvents(j.events ?? [])
        setCanEdit(!!j.can_edit)
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [from, to, scope, reloadKey])

  // Every team member can connect their own Google account. Tell them how the connection went when Google sends them back.
  useEffect(() => {
    fetch('/api/calendar/google', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configured: boolean; connected: boolean; email: string | null } | null) => setGoogle(j))
      .catch(() => {})
    const code = new URLSearchParams(window.location.search).get('google')
    if (code) {
      const text: Record<string, string> = {
        connected: 'Google Calendar connected',
        denied: 'Google access was not allowed',
        missing_config: 'Google sign-in is not set up on the server',
        forbidden: 'Only the team can connect Google Calendar',
        error: 'Could not connect Google Calendar',
      }
      if (code === 'connected') message.success(text[code])
      else message.error(text[code] ?? text.error)
      window.history.replaceState(null, '', '/calendar')
    }
  }, [reloadKey])

  useEffect(() => {
    if (!canEdit) return
    fetch('/api/users', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; full_name?: string | null; email?: string | null; role?: string | null }>) => {
        if (!Array.isArray(rows)) return
        setPeople(
          rows
            .filter((u) => (u.role ?? '').toLowerCase() !== 'customer')
            .map((u) => ({ id: u.id, label: u.full_name || u.email || u.id }))
            .sort((a, b) => a.label.localeCompare(b.label))
        )
      })
      .catch(() => {})
  }, [canEdit])

  const ticketsByDay = useMemo(() => {
    const m = new Map<string, CalTicket[]>()
    for (const t of tickets) {
      if (!t.due_date) continue
      // The due moment counted on the WIB calendar day, whatever the browser time zone is.
      const key = dayjs(t.due_date).add(dayjs(t.due_date).utcOffset() * -1 + 7 * 60, 'minute').format('YYYY-MM-DD')
      m.set(key, [...(m.get(key) ?? []), t])
    }
    return m
  }, [tickets])

  /** Entries per day: a multi-day entry shows on every day it covers. */
  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEventOut[]>()
    const visible = events.filter((e) => show.includes(e.type))
    for (const e of visible) {
      for (let d = dayjs(e.start_date); !d.isAfter(dayjs(e.end_date), 'day'); d = d.add(1, 'day')) {
        const key = d.format('YYYY-MM-DD')
        m.set(key, [...(m.get(key) ?? []), e])
      }
    }
    return m
  }, [events, show])

  const holidayByDay = useMemo(() => new Map(holidays.map((h) => [h.date, h.name])), [holidays])
  const showTickets = show.includes('tickets')
  const showHolidays = show.includes('holiday')
  const isDone = (s: string) => DONE_STATUSES.includes(s.toLowerCase())

  const key = selected.format('YYYY-MM-DD')
  const dayTickets = showTickets ? (ticketsByDay.get(key) ?? []) : []
  const dayEvents = eventsByDay.get(key) ?? []
  const dayHoliday = showHolidays ? holidayByDay.get(key) : undefined

  const openForm = (row: CalendarEventOut | 'new') => {
    setEditing(row)
    if (row === 'new') {
      form.resetFields()
      form.setFieldsValue({ type: 'leave', range: [selected, selected], repeat_yearly: false })
    } else {
      form.setFieldsValue({
        type: row.type,
        title: row.title,
        user_id: row.user_id ?? undefined,
        range: [dayjs(row.origin_start), dayjs(row.origin_end)],
        repeat_yearly: row.repeat_yearly,
        notes: row.notes ?? undefined,
      })
    }
  }

  const nameOf = (id?: string) => people.find((p) => p.id === id)?.label

  // A sensible title for the usual cases, so entering one is two clicks.
  const suggestTitle = useCallback(
    (type: CalendarEventType, userId?: string) => {
      const n = nameOf(userId)
      if (!n) return ''
      if (type === 'birthday') return `${n}'s birthday`
      if (type === 'leave') return `${n} - leave`
      if (type === 'duty') return `${n} - duty`
      return ''
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people]
  )

  const save = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      const body = {
        type: v.type,
        title: v.title,
        user_id: v.user_id ?? null,
        start_date: v.range[0].format('YYYY-MM-DD'),
        end_date: v.range[1].format('YYYY-MM-DD'),
        repeat_yearly: !!v.repeat_yearly,
        notes: v.notes ?? null,
      }
      const isNew = editing === 'new'
      const res = await fetch(isNew ? '/api/calendar/events' : `/api/calendar/events/${(editing as CalendarEventOut).id}`, {
        method: isNew ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'Failed to save')
      message.success('Saved')
      setEditing(null)
      setReloadKey((k) => k + 1)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const togglePick = (id: string, on: boolean) => setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)))

  // Every entry of the month on screen (of the kinds that are switched on).
  const monthEntryIds = useMemo(
    () => [...new Set(events.filter((e) => show.includes(e.type) && e.end_date >= month.startOf('month').format('YYYY-MM-DD') && e.start_date <= month.endOf('month').format('YYYY-MM-DD')).map((e) => e.id))],
    [events, show, month]
  )

  const pushPicked = async () => {
    setPushing(true)
    try {
      const res = await fetch('/api/calendar/google/push', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_ids: picked }),
      })
      const j = (await res.json().catch(() => ({}))) as { created?: number; updated?: number; failed?: Array<{ title: string; error: string }>; error?: string }
      if (!res.ok) throw new Error(j.error || 'Failed to send')
      const failed = j.failed?.length ?? 0
      const text = `${j.created ?? 0} added, ${j.updated ?? 0} updated in Google Calendar`
      if (failed) message.warning(`${text}. ${failed} failed: ${j.failed!.map((f) => f.title).slice(0, 3).join(', ')}`)
      else message.success(text)
      setPicked([])
      setReloadKey((k) => k + 1)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setPushing(false)
    }
  }

  const disconnectGoogle = async () => {
    const res = await fetch('/api/calendar/google', { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return message.error('Failed to disconnect')
    setGoogle((g) => (g ? { ...g, connected: false, email: null } : g))
    setPicked([])
    setReloadKey((k) => k + 1)
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/calendar/events/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return message.error('Failed to delete')
    setReloadKey((k) => k + 1)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 1200 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Flex justify="space-between" align="center" wrap gap={12}>
              <div>
                <Title level={2} style={{ margin: 0 }}>Calendar</Title>
                <Text type="secondary">Birthdays, holidays, leave, duty and tickets by due date (WIB). Click a day for details.</Text>
              </div>
              <Space wrap>
                <Segmented
                  value={scope}
                  onChange={(v) => setScope(v as 'mine' | 'all')}
                  options={[
                    { value: 'mine', label: 'My tickets' },
                    { value: 'all', label: 'All tickets' },
                  ]}
                />
                {canEdit ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm('new')}>
                    Add entry
                  </Button>
                ) : null}
              </Space>
            </Flex>

            {google ? (
              <Card size="small">
                <Flex justify="space-between" align="center" gap={12} wrap>
                  {google.connected ? (
                    <>
                      <Space wrap>
                        <Tag icon={<GoogleOutlined />} color="blue" style={{ margin: 0 }}>Google Calendar: {google.email ?? 'connected'}</Tag>
                        <Text type="secondary">Tick entries below, or pick the whole month, then send them to your own Google Calendar.</Text>
                      </Space>
                      <Space wrap>
                        <Button size="small" onClick={() => setPicked(monthEntryIds)} disabled={monthEntryIds.length === 0}>
                          Select this month ({monthEntryIds.length})
                        </Button>
                        <Button size="small" onClick={() => setPicked([])} disabled={picked.length === 0}>
                          Clear
                        </Button>
                        <Button type="primary" size="small" icon={<GoogleOutlined />} loading={pushing} disabled={picked.length === 0} onClick={() => void pushPicked()}>
                          Send {picked.length || ''} to Google Calendar
                        </Button>
                        <Popconfirm title="Disconnect Google Calendar?" description="Entries already in Google stay there, but later edits will no longer follow." okText="Disconnect" onConfirm={() => void disconnectGoogle()}>
                          <Button size="small" type="link">Disconnect</Button>
                        </Popconfirm>
                      </Space>
                    </>
                  ) : (
                    <>
                      <Text type="secondary">
                        {google.configured ? 'Connect your Google account to send these entries to your own Google Calendar.' : 'Google sign-in is not set up on the server yet.'}
                      </Text>
                      <Button icon={<GoogleOutlined />} disabled={!google.configured} href="/api/calendar/google/connect">
                        Connect Google Calendar
                      </Button>
                    </>
                  )}
                </Flex>
              </Card>
            ) : null}

            <Flex gap={8} wrap>
              <Tag.CheckableTag checked={showTickets} onChange={(c) => setShow((s) => (c ? [...s, 'tickets'] : s.filter((x) => x !== 'tickets')))}>
                Tickets due
              </Tag.CheckableTag>
              {CALENDAR_EVENT_TYPES.map((t) => (
                <Tag.CheckableTag key={t} checked={show.includes(t)} onChange={(c) => setShow((s) => (c ? [...s, t] : s.filter((x) => x !== t)))}>
                  {CALENDAR_TYPE_META[t].label}
                </Tag.CheckableTag>
              ))}
            </Flex>

            {error ? <Alert type="error" showIcon title={error} /> : null}

            <Card size="small">
              <Calendar
                value={selected}
                onSelect={(d, info) => {
                  setSelected(d)
                  if (info.source === 'date' && !d.isSame(month, 'month')) setMonth(d)
                }}
                onPanelChange={(d) => setMonth(d)}
                cellRender={(d, info) => {
                  if (info.type !== 'date') return info.originNode
                  const k = d.format('YYYY-MM-DD')
                  const ev = eventsByDay.get(k) ?? []
                  const tk = showTickets ? (ticketsByDay.get(k) ?? []) : []
                  const hol = showHolidays ? holidayByDay.get(k) : undefined
                  const lines: Array<{ key: string; node: React.ReactNode }> = [
                    ...(hol ? [{ key: 'h', node: <Badge color="red" text={hol} /> }] : []),
                    ...ev.map((e) => ({ key: `e${e.id}`, node: <Badge color={CALENDAR_TYPE_META[e.type].color === 'default' ? 'gray' : CALENDAR_TYPE_META[e.type].color} text={e.title} /> })),
                    ...tk.map((t) => ({
                      key: `t${t.id}`,
                      node: <Badge status={isDone(t.status) ? 'default' : 'processing'} text={`#${t.id} ${t.title}`} />,
                    })),
                  ]
                  return (
                    <div style={{ minHeight: 64 }}>
                      {lines.slice(0, MAX_IN_CELL).map((l) => (
                        <div key={l.key} style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.node}</div>
                      ))}
                      {lines.length > MAX_IN_CELL ? <Text type="secondary" style={{ fontSize: 12 }}>+{lines.length - MAX_IN_CELL} more</Text> : null}
                    </div>
                  )
                }}
              />
            </Card>

            <Card size="small" title={selected.format('dddd, MMM D, YYYY')}>
              {dayHoliday ? <Tag color="red" style={{ marginBottom: 8 }}>Holiday: {dayHoliday}</Tag> : null}

              {dayEvents.length > 0 ? (
                <Flex vertical gap={8} style={{ marginBottom: dayTickets.length ? 16 : 0 }}>
                  {dayEvents.map((e) => (
                    <Flex key={`${e.id}-${e.start_date}`} justify="space-between" align="center" gap={12} wrap>
                      <Space wrap>
                        {google?.connected ? <Checkbox checked={picked.includes(e.id)} onChange={(ev) => togglePick(e.id, ev.target.checked)} /> : null}
                        <Tag color={CALENDAR_TYPE_META[e.type].color} style={{ margin: 0 }}>{CALENDAR_TYPE_META[e.type].label}</Tag>
                        <Text strong>{e.title}</Text>
                        {e.user_name && !e.title.includes(e.user_name) ? <Text type="secondary">{e.user_name}</Text> : null}
                        {e.start_date !== e.end_date ? <Text type="secondary">{dayjs(e.start_date).format('MMM D')} - {dayjs(e.end_date).format('MMM D')}</Text> : null}
                        {e.repeat_yearly ? <Tag style={{ margin: 0 }}>Every year</Tag> : null}
                        {e.synced ? <Tag icon={<GoogleOutlined />} color="green" style={{ margin: 0 }}>In your Google Calendar</Tag> : null}
                        {e.notes ? <Text type="secondary">{e.notes}</Text> : null}
                      </Space>
                      {canEdit ? (
                        <Space size={4}>
                          <Button size="small" icon={<EditOutlined />} onClick={() => openForm(e)} aria-label="Edit entry" />
                          <Popconfirm title="Delete this entry?" description={e.repeat_yearly ? 'It repeats every year; all years are removed.' : undefined} okText="Delete" onConfirm={() => void remove(e.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete entry" />
                          </Popconfirm>
                        </Space>
                      ) : null}
                    </Flex>
                  ))}
                </Flex>
              ) : null}

              {dayTickets.length > 0 ? (
                <Flex vertical gap={8}>
                  <Text type="secondary">{dayTickets.length} ticket(s) due</Text>
                  {dayTickets.map((t) => (
                    <Flex key={t.id} justify="space-between" align="center" gap={12} wrap>
                      <a href={`/tickets/${t.id}`} target="_blank" rel="noopener noreferrer">
                        #{t.id} - {t.title}
                      </a>
                      <Space size={4}>
                        {t.company_name ? <Text type="secondary">{t.company_name}</Text> : null}
                        <Tag style={{ margin: 0 }}>{t.status}</Tag>
                        <Text type="secondary">{dayjs(t.due_date).format('HH:mm')}</Text>
                      </Space>
                    </Flex>
                  ))}
                </Flex>
              ) : null}

              {!dayHoliday && dayEvents.length === 0 && dayTickets.length === 0 ? <Text type="secondary">Nothing on this day.</Text> : null}
            </Card>
          </Space>
        </Content>
      </AdminMainColumn>

      <Modal
        title={editing === 'new' ? 'Add entry' : 'Edit entry'}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="Save"
        destroyOnHidden
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changed, all) => {
            // Birthdays and holidays come back every year; the title is suggested from the person.
            if ('type' in changed) {
              form.setFieldsValue({ repeat_yearly: changed.type === 'birthday' || changed.type === 'holiday' })
            }
            if (('user_id' in changed || 'type' in changed) && !all.title) {
              const t = suggestTitle(all.type, all.user_id)
              if (t) form.setFieldsValue({ title: t })
            }
          }}
        >
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={CALENDAR_EVENT_TYPES.map((t) => ({ value: t, label: CALENDAR_TYPE_META[t].label }))} />
          </Form.Item>
          <Form.Item
            name="user_id"
            label="Person"
            rules={[{ required: NEEDS_PERSON.includes(formType), message: 'Choose the person' }]}
            extra={NEEDS_PERSON.includes(formType) ? undefined : 'Optional'}
          >
            <Select allowClear showSearch optionFilterProp="label" placeholder="Choose a person" options={people.map((p) => ({ value: p.id, label: p.label }))} />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Enter a title' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="range" label="Date" rules={[{ required: true, message: 'Choose the date' }]}>
            <DatePicker.RangePicker allowClear={false} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="repeat_yearly" label="Repeats every year" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
