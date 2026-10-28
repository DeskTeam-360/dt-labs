'use client'

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, DatePicker, Flex, Form, Input, InputNumber, message, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import { type Frequency,frequencyLabel } from '@/lib/recurring-ticket-schedule'

const { Text } = Typography

type Schedule = {
  id: string
  companyWebsiteId: string
  websiteUrl: string | null
  companyName: string | null
  frequency: Frequency
  specificDays: number[] | null
  specificDate: number[] | null
  intervalDays: number | null
  timeOfDay: string
  timezone: string
  startDate: string
  endDate: string | null
  maxDepth: number
  maxPages: number
  notifyEmails: string[]
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastSessionId: string | null
  lastNewBroken: number | null
}

export type ScheduleWebsiteOption = { id: string; url: string; company: string }

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const FREQUENCY_OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: 'specific_days', label: 'Chosen weekdays (e.g. Monday and Friday)' },
  { value: 'specific_date', label: 'Chosen dates of the month' },
  { value: 'interval', label: 'Every N days (7 = weekly)' },
  { value: 'weekdays', label: 'Every weekday (Mon-Fri)' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'daily', label: 'Every day' },
]

type FormValues = {
  company_website_id: string
  frequency: Frequency
  specific_days: number[]
  specific_date: number[]
  interval_days: number
  time_of_day: string
  start_date: dayjs.Dayjs
  end_date: dayjs.Dayjs | null
  max_depth: number
  max_pages: number
  notify_emails: string[]
}

/** Scheduled crawls: pick a website and when it should be crawled again. Admins and agents get an email when new broken pages appear. */
export default function CrawlSchedulesModal({
  open,
  onClose,
  websites,
  defaultEmail,
}: {
  open: boolean
  onClose: () => void
  websites: ScheduleWebsiteOption[]
  defaultEmail?: string | null
}) {
  const [rows, setRows] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const frequency = Form.useWatch('frequency', form)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crawl-schedules', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load schedules')
      setRows(json.data ?? [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const openForm = (row: Schedule | 'new') => {
    setEditing(row)
    if (row === 'new') {
      form.resetFields()
      form.setFieldsValue({
        frequency: 'specific_days',
        specific_days: [1],
        specific_date: [1],
        interval_days: 7,
        time_of_day: '02:00',
        start_date: dayjs(),
        end_date: null,
        max_depth: 3,
        max_pages: 100,
        notify_emails: defaultEmail ? [defaultEmail] : [],
      })
    } else {
      form.setFieldsValue({
        company_website_id: row.companyWebsiteId,
        frequency: row.frequency,
        specific_days: row.specificDays ?? [],
        specific_date: row.specificDate ?? [],
        interval_days: row.intervalDays ?? 7,
        time_of_day: row.timeOfDay,
        start_date: dayjs(row.startDate),
        end_date: row.endDate ? dayjs(row.endDate) : null,
        max_depth: row.maxDepth,
        max_pages: row.maxPages,
        notify_emails: row.notifyEmails ?? [],
      })
    }
  }

  const save = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      const body = {
        ...(editing === 'new' ? { company_website_id: v.company_website_id } : {}),
        frequency: v.frequency,
        specific_days: v.specific_days ?? [],
        specific_date: v.specific_date ?? [],
        interval_days: v.interval_days,
        time_of_day: v.time_of_day,
        timezone: 'Asia/Jakarta',
        start_date: v.start_date.format('YYYY-MM-DD'),
        end_date: v.end_date ? v.end_date.format('YYYY-MM-DD') : null,
        max_depth: v.max_depth,
        max_pages: v.max_pages,
        notify_emails: v.notify_emails ?? [],
      }
      const isNew = editing === 'new'
      const res = await fetch(isNew ? '/api/crawl-schedules' : `/api/crawl-schedules/${(editing as Schedule).id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      message.success('Schedule saved')
      setEditing(null)
      void load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/crawl-schedules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
    if (!res.ok) message.error('Failed to update')
    void load()
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/crawl-schedules/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) message.error('Failed to delete')
    void load()
  }

  return (
    <>
      <Modal title="Scheduled crawls" open={open} onCancel={onClose} footer={null} width={1000} destroyOnHidden>
        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }} gap={12} wrap>
          <Text type="secondary">Times are WIB. When a scheduled crawl finishes, pages that are broken now and were not broken in the previous crawl are emailed.</Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm('new')}>
            New schedule
          </Button>
        </Flex>
        <Table
          size="middle"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: 'Website',
              render: (_: unknown, r: Schedule) => (
                <div>
                  <div>{r.websiteUrl ?? '-'}</div>
                  {r.companyName ? <Text type="secondary">{r.companyName}</Text> : null}
                </div>
              ),
            },
            {
              title: 'When',
              render: (_: unknown, r: Schedule) => (
                <div>
                  <div>{frequencyLabel({ frequency: r.frequency, specificDays: r.specificDays, specificDate: r.specificDate, intervalDays: r.intervalDays, timeOfDay: r.timeOfDay, timezone: r.timezone, startDate: r.startDate })}</div>
                  <Text type="secondary">at {r.timeOfDay} WIB</Text>
                </div>
              ),
            },
            { title: 'Next run', dataIndex: 'nextRunAt', render: (v: string | null) => (v ? <DateDisplay date={v} /> : '-') },
            {
              title: 'Last run',
              render: (_: unknown, r: Schedule) =>
                r.lastRunAt ? (
                  <div>
                    <DateDisplay date={r.lastRunAt} />
                    {r.lastNewBroken ? <div><Tag color="red">{r.lastNewBroken} new broken</Tag></div> : r.lastNewBroken === 0 ? <div><Tag color="green">No new broken</Tag></div> : null}
                  </div>
                ) : (
                  '-'
                ),
            },
            { title: 'Active', dataIndex: 'isActive', width: 80, render: (v: boolean, r: Schedule) => <Switch size="small" checked={v} onChange={(c) => void patch(r.id, { is_active: c })} /> },
            {
              title: '',
              width: 90,
              render: (_: unknown, r: Schedule) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openForm(r)} />
                  <Popconfirm title="Delete this schedule?" onConfirm={() => void remove(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={editing === 'new' ? 'New crawl schedule' : 'Edit crawl schedule'}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="Save"
        destroyOnHidden
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item name="company_website_id" label="Website" rules={[{ required: true, message: 'Choose a website' }]}>
            <Select
              showSearch
              disabled={editing !== 'new'}
              optionFilterProp="label"
              placeholder="Websites that were crawled before"
              options={websites.map((w) => ({ value: w.id, label: `${w.company} - ${w.url}` }))}
            />
          </Form.Item>
          <Form.Item name="frequency" label="Repeat" rules={[{ required: true }]}>
            <Select options={FREQUENCY_OPTIONS} />
          </Form.Item>
          {frequency === 'specific_days' ? (
            <Form.Item name="specific_days" label="On these weekdays" rules={[{ required: true, type: 'array', min: 1, message: 'Pick at least one day' }]}>
              <Select mode="multiple" options={DAYS} />
            </Form.Item>
          ) : null}
          {frequency === 'specific_date' ? (
            <Form.Item name="specific_date" label="On these dates of the month" rules={[{ required: true, type: 'array', min: 1, message: 'Pick at least one date' }]}>
              <Select mode="multiple" options={Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
            </Form.Item>
          ) : null}
          {frequency === 'interval' ? (
            <Form.Item name="interval_days" label="Every how many days" rules={[{ required: true }]}>
              <InputNumber min={1} max={365} style={{ width: 120 }} />
            </Form.Item>
          ) : null}
          <Flex gap={12} wrap>
            <Form.Item name="time_of_day" label="Time (WIB)" rules={[{ required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'Use HH:MM' }]}>
              <Input style={{ width: 110 }} placeholder="02:00" />
            </Form.Item>
            <Form.Item name="start_date" label="Starts" rules={[{ required: true }]}>
              <DatePicker allowClear={false} />
            </Form.Item>
            <Form.Item name="end_date" label="Ends (optional)">
              <DatePicker />
            </Form.Item>
          </Flex>
          <Flex gap={12} wrap>
            <Form.Item name="max_depth" label="Max depth">
              <InputNumber min={1} max={10} />
            </Form.Item>
            <Form.Item name="max_pages" label="Max pages">
              <InputNumber min={1} max={1000} />
            </Form.Item>
          </Flex>
          <Form.Item name="notify_emails" label="Email new broken pages to">
            <Select mode="tags" tokenSeparators={[',', ' ']} placeholder="Type an email and press Enter" open={false} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
