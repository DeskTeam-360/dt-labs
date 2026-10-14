'use client'

import { ArrowLeftOutlined, DeleteOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Layout,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

type Cell = { h: number; r: string; s: 'default' | 'auto' | 'manual' } | null
type AvailabilityUser = {
  id: string
  name: string
  role: string
  position: string | null
  joined_at: string | null
  left_at: string | null
  cells: Cell[]
}
type GridData = {
  month: string
  days: string[]
  today: string
  holidays: { date: string; name: string }[]
  users: AvailabilityUser[]
}

const REASON_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  work: { bg: '#f6ffed', fg: '#389e0d', label: 'Working day' },
  weekend: { bg: '#f0f0f0', fg: '#8c8c8c', label: 'Weekend' },
  holiday: { bg: '#e6e6e6', fg: '#595959', label: 'Public holiday' },
  leave: { bg: '#fff7e6', fg: '#d46b08', label: 'Leave' },
  sick: { bg: '#fff1f0', fg: '#cf1322', label: 'Sick' },
  piket: { bg: '#e6f4ff', fg: '#0958d9', label: 'On duty (piket)' },
  other: { bg: '#f9f0ff', fg: '#531dab', label: 'Other' },
}

const KIND_OPTIONS = [
  { value: 'leave', label: 'Leave (cuti)' },
  { value: 'sick', label: 'Sick (sakit)' },
  { value: 'piket', label: 'On duty (piket) – works on a day off' },
  { value: 'other', label: 'Other (set hours manually)' },
  { value: 'normal', label: 'Back to normal (reset)' },
]

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function dayLabel(ymd: string): { num: string; dow: string; weekend: boolean } {
  const d = dayjs(ymd)
  return { num: d.format('D'), dow: DAY_NAMES[d.day()], weekend: d.day() === 0 || d.day() === 6 }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed')
  return data as T
}

function CalendarTab() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [grid, setGrid] = useState<GridData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const kind = Form.useWatch('kind', form)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setGrid(await api<GridData>(`/api/team-availability?month=${month.format('YYYY-MM')}`))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (values: { user_ids: string[]; range: [Dayjs, Dayjs]; kind: string; hours?: number }) => {
    setSaving(true)
    try {
      const res = await api<{ updated: number }>('/api/team-availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_ids: values.user_ids,
          from: values.range[0].format('YYYY-MM-DD'),
          to: values.range[1].format('YYYY-MM-DD'),
          kind: values.kind,
          hours: values.hours ?? null,
        }),
      })
      message.success(res.updated > 0 ? `Saved (${res.updated} day${res.updated === 1 ? '' : 's'} updated)` : 'Nothing to update for that selection')
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const totals = useMemo(() => {
    if (!grid) return []
    return grid.days.map((_, i) => grid.users.reduce((sum, u) => sum + (u.cells[i]?.h ?? 0), 0))
  }, [grid])

  const holidayByDate = useMemo(() => new Map((grid?.holidays ?? []).map((h) => [h.date, h.name])), [grid])

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small" title="Set availability">
        <Form
          form={form}
          layout="inline"
          onFinish={save}
          initialValues={{ kind: 'leave' }}
          style={{ rowGap: 12 }}
        >
          <Form.Item name="user_ids" rules={[{ required: true, message: 'Pick at least one person' }]}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Who?"
              style={{ minWidth: 260 }}
              options={(grid?.users ?? []).map((u) => ({ value: u.id, label: u.name }))}
            />
          </Form.Item>
          <Form.Item name="range" rules={[{ required: true, message: 'Pick the dates' }]}>
            <RangePicker allowClear={false} />
          </Form.Item>
          <Form.Item name="kind" rules={[{ required: true }]}>
            <Select style={{ width: 280 }} options={KIND_OPTIONS} />
          </Form.Item>
          {(kind === 'leave' || kind === 'sick' || kind === 'piket' || kind === 'other') && (
            <Form.Item
              name="hours"
              extra={undefined}
              tooltip="Leave empty for the usual value: leave/sick = 0 hours, on duty = 8 hours."
            >
              <InputNumber min={0} max={24} step={0.5} placeholder="Hours (optional)" style={{ width: 150 }} />
            </Form.Item>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save
            </Button>
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Tip: click a day in the table below to fill in the person and date. Leave and sick skip weekends and public
          holidays automatically. For a half day, enter the hours that person still works (for example 4).
        </Text>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <Button icon={<LeftOutlined />} onClick={() => setMonth((m) => m.subtract(1, 'month'))} />
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(v) => v && setMonth(v.startOf('month'))}
            />
            <Button icon={<RightOutlined />} onClick={() => setMonth((m) => m.add(1, 'month'))} />
            <Button onClick={() => setMonth(dayjs().startOf('month'))}>This month</Button>
          </Space>
        }
        extra={
          <Space size={[4, 4]} wrap>
            {Object.entries(REASON_STYLE).map(([k, v]) => (
              <Tag key={k} style={{ background: v.bg, color: v.fg, borderColor: v.fg + '55', margin: 0 }}>
                {v.label}
              </Tag>
            ))}
          </Space>
        }
        loading={loading && !grid}
      >
        {grid && (
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, left: 0, background: 'var(--ant-color-bg-container, #fff)', zIndex: 4, textAlign: 'left', padding: '6px 10px', minWidth: 190, borderBottom: '1px solid #f0f0f0' }}>
                    Person
                  </th>
                  {grid.days.map((d) => {
                    const l = dayLabel(d)
                    const hol = holidayByDate.get(d)
                    return (
                      <th
                        key={d}
                        title={hol}
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 3,
                          background: 'var(--ant-color-bg-container, #fff)',
                          minWidth: 34,
                          padding: '4px 0',
                          textAlign: 'center',
                          borderBottom: '1px solid #f0f0f0',
                          color: l.weekend || hol ? '#cf1322' : undefined,
                          outline: d === grid.today ? '2px solid #1677ff' : undefined,
                          outlineOffset: -2,
                        }}
                      >
                        <div>{l.num}</div>
                        <div style={{ fontWeight: 400, fontSize: 10 }}>{l.dow}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {grid.users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--ant-color-bg-container, #fff)', zIndex: 1, padding: '4px 10px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                        {u.position || u.role}
                        {u.left_at ? ` · last day ${u.left_at}` : ''}
                      </div>
                    </td>
                    {grid.days.map((d, i) => {
                      const c = u.cells[i]
                      const st = c ? REASON_STYLE[c.r] ?? REASON_STYLE.other : null
                      return (
                        <td
                          key={d}
                          onClick={() => {
                            const day = dayjs(d)
                            form.setFieldsValue({ user_ids: [u.id], range: [day, day] })
                          }}
                          style={{
                            cursor: 'pointer',
                            textAlign: 'center',
                            padding: '6px 0',
                            borderBottom: '1px solid #f5f5f5',
                            borderLeft: '1px solid #fff',
                            background: st?.bg ?? 'repeating-linear-gradient(45deg,#fafafa,#fafafa 4px,#f0f0f0 4px,#f0f0f0 8px)',
                            color: st?.fg,
                            fontWeight: c?.s === 'manual' ? 700 : 400,
                          }}
                        >
                          <Tooltip
                            title={
                              c
                                ? `${u.name} · ${d}: ${c.h}h · ${st?.label}${c.s === 'manual' ? ' (set by admin)' : ''}`
                                : `${u.name} · ${d}: not employed`
                            }
                          >
                            <span style={{ display: 'block' }}>{c ? c.h : ''}</span>
                          </Tooltip>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--ant-color-bg-container, #fff)', zIndex: 1, padding: '6px 10px', fontWeight: 600 }}>
                    Team capacity (hours)
                  </td>
                  {totals.map((t, i) => (
                    <td key={grid.days[i]} style={{ textAlign: 'center', fontWeight: 600, padding: '6px 0' }}>
                      {t}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Space>
  )
}

function HolidaysTab() {
  const [year, setYear] = useState<Dayjs>(() => dayjs())
  const [rows, setRows] = useState<{ date: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ holidays: { date: string; name: string }[] }>(`/api/holidays?year=${year.format('YYYY')}`)
      setRows(res.holidays)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  const add = async (values: { date: Dayjs; name: string }) => {
    try {
      await api('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: values.date.format('YYYY-MM-DD'), name: values.name }),
      })
      message.success('Holiday saved')
      form.resetFields()
      if (values.date.year() !== year.year()) setYear(values.date)
      else await load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const remove = async (date: string) => {
    try {
      await api(`/api/holidays?date=${date}`, { method: 'DELETE' })
      message.success('Holiday removed')
      await load()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        title="Public holidays count as 0 capacity hours for everyone, like weekends."
        description="Adding or removing a holiday updates the days that were generated automatically. Days an admin set by hand (leave, on duty, ...) are not changed."
      />
      <Card size="small" title="Add a holiday">
        <Form form={form} layout="inline" onFinish={add} style={{ rowGap: 12 }}>
          <Form.Item name="date" rules={[{ required: true, message: 'Pick a date' }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="name" rules={[{ required: true, message: 'Enter a name' }]}>
            <Input placeholder="Name, e.g. Independence Day" style={{ width: 300 }} maxLength={255} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Add
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card
        size="small"
        title="Holidays"
        extra={<DatePicker picker="year" allowClear={false} value={year} onChange={(v) => v && setYear(v)} />}
      >
        <Table
          rowKey="date"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: 'No holidays for this year yet' }}
          columns={[
            { title: 'Date', dataIndex: 'date', width: 180, render: (v: string) => dayjs(v).format('ddd, D MMM YYYY') },
            { title: 'Name', dataIndex: 'name' },
            {
              title: '',
              width: 70,
              render: (_: unknown, r: { date: string }) => (
                <Popconfirm title="Remove this holiday?" okText="Remove" onConfirm={() => void remove(r.date)}>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove holiday" />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  )
}

interface TeamAvailabilityContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function TeamAvailabilityContent({ user: currentUser }: TeamAvailabilityContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>
                  Back to Settings
                </Button>
              </SpaNavLink>
              <Title level={2} style={{ margin: '8px 0 0' }}>
                Team Availability
              </Title>
              <Text type="secondary">
                Working hours per person per day (WIB). Used to calculate team capacity. Everyone defaults to 8 hours on
                weekdays and 0 on weekends and public holidays.
              </Text>
            </div>
            <Tabs
              items={[
                { key: 'calendar', label: 'Calendar', children: <CalendarTab /> },
                { key: 'holidays', label: 'Public holidays', children: <HolidaysTab /> },
              ]}
            />
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
