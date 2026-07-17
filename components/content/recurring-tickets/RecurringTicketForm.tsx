'use client'

import {
  Button,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Spin,
  TimePicker,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'

import {
  DEFAULT_RECURRING_VISIBILITY,
  TICKET_VISIBILITY_OPTIONS,
} from '@/lib/ticket-visibility'

import type { RecurringTicketRow } from './RecurringTicketsContent'

const { Text } = Typography

const DAY_OPTIONS = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
]

const COMMON_TIMEZONES = [
  'UTC', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Bangkok',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Australia/Sydney',
]

interface OptionItem { label: string; value: string | number }

interface Props {
  initialValues: RecurringTicketRow | null
  onSaved: () => void
  onCancel: () => void
}

export default function RecurringTicketForm({ initialValues, onSaved, onCancel }: Props) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [messageApi, ctx] = message.useMessage()
  const frequency = Form.useWatch('frequency', form)

  // Options loaded from API
  const [companies, setCompanies] = useState<OptionItem[]>([])
  const [teams, setTeams] = useState<OptionItem[]>([])

  const [ticketTypes, setTicketTypes] = useState<OptionItem[]>([])
  const [statuses, setStatuses] = useState<OptionItem[]>([])
  const [contacts, setContacts] = useState<OptionItem[]>([])

  const isEdit = !!initialValues

  useEffect(() => {
    Promise.all([
      fetch('/api/companies').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/teams').then(r => r.json()).catch(() => ({ data: [] })),

      fetch('/api/ticket-types').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/ticket-statuses').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/users?limit=500').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([comp, team, types, sts, allUsr]) => {
      setCompanies((comp.data ?? comp ?? []).map((c: { id: string; name: string }) => ({ label: c.name, value: c.id })))
      setTeams((team.data ?? team ?? []).map((t: { id: string; name: string }) => ({ label: t.name, value: t.id })))
      const typesArr = Array.isArray(types) ? types : (types.data ?? [])
      setTicketTypes(typesArr.map((t: { id: number | string; title?: string; name?: string; slug?: string }) => ({ label: t.title ?? t.name ?? t.slug ?? String(t.id), value: t.id })))
      const stsArr = Array.isArray(sts) ? sts : (sts.data ?? [])
      setStatuses(stsArr.map((s: { id?: number; slug?: string; title?: string; name?: string }) => ({ label: s.title ?? s.name ?? s.slug ?? '', value: s.slug ?? String(s.id ?? '') })))
      setContacts((allUsr.data ?? allUsr ?? []).map((u: { id: string; name?: string; email?: string; firstName?: string; lastName?: string }) => ({
        label: `${u.name ?? (`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || '')} ${u.email ? `(${u.email})` : ''}`.trim(),
        value: u.id,
      })))
    }).finally(() => setLoadingOptions(false))
  }, [])

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue({
        title: initialValues.title,
        description: initialValues.description ?? '',
        frequency: initialValues.frequency,
        specific_days: initialValues.specificDays ?? [],
        specific_date: initialValues.specificDate ?? 1,
        interval_days: initialValues.intervalDays ?? 2,
        time_of_day: dayjs(initialValues.timeOfDay, 'HH:mm'),
        timezone: initialValues.timezone,
        start_date: dayjs(initialValues.startDate),
        end_date: initialValues.endDate ? dayjs(initialValues.endDate) : null,
        ticket_status: initialValues.ticketStatus ?? 'open',
        ticket_priority: initialValues.ticketPriority || null,
        visibility: initialValues.visibility ?? DEFAULT_RECURRING_VISIBILITY,
        company_id: initialValues.companyId ?? null,
        team_id: initialValues.teamId ?? null,
        ticket_type_id: initialValues.ticketTypeId ?? null,
        contact_user_id: initialValues.contactUserId ?? null,
      })
    } else {
      form.setFieldsValue({
        frequency: 'daily',
        specific_days: [],
        specific_date: 1,
        interval_days: 2,
        time_of_day: dayjs('08:00', 'HH:mm'),
        timezone: 'Asia/Jakarta',
        start_date: dayjs(),
        ticket_status: 'open',
        ticket_priority: null,
        visibility: DEFAULT_RECURRING_VISIBILITY,
      })
    }
  }, [initialValues, form])

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      const body = {
        title: values.title,
        description: values.description || null,
        frequency: values.frequency,
        specific_days: values.frequency === 'specific_days' ? values.specific_days : null,
        specific_date: values.frequency === 'specific_date' ? values.specific_date : null,
        interval_days: values.frequency === 'interval' ? values.interval_days : null,
        time_of_day: (values.time_of_day as dayjs.Dayjs).format('HH:mm'),
        timezone: values.timezone,
        start_date: (values.start_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        end_date: values.end_date ? (values.end_date as dayjs.Dayjs).format('YYYY-MM-DD') : null,
        ticket_status: values.ticket_status || 'open',
        ticket_priority: values.ticket_priority || null,
        visibility: values.visibility ?? DEFAULT_RECURRING_VISIBILITY,
        company_id: values.company_id || null,
        team_id: values.team_id || null,

        ticket_type_id: values.ticket_type_id || null,
        contact_user_id: values.contact_user_id || null,
      }

      const url = isEdit ? `/api/recurring-tickets/${initialValues!.id}` : '/api/recurring-tickets'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to save')
      }

      messageApi.success(isEdit ? 'Updated' : 'Created')
      onSaved()
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loadingOptions) {
    return <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
  }

  return (
    <>
      {ctx}
      <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 8 }}>

        {/* ── Ticket Content ── */}
        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
          <Input placeholder="e.g. Weekly server backup check" />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="Optional ticket description" />
        </Form.Item>

        <Divider orientation="left" orientationMargin={0}>
          <Text type="secondary" style={{ fontSize: 12 }}>Schedule</Text>
        </Divider>

        {/* ── Schedule ── */}
        <Form.Item name="frequency" label="Frequency" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="daily">Every day</Select.Option>
            <Select.Option value="weekdays">Weekdays (Mon–Fri)</Select.Option>
            <Select.Option value="weekends">Weekends (Sat–Sun)</Select.Option>
            <Select.Option value="specific_days">Specific days of the week</Select.Option>
            <Select.Option value="specific_date">Specific date each month</Select.Option>
            <Select.Option value="interval">Every N days</Select.Option>
          </Select>
        </Form.Item>

        {frequency === 'specific_days' && (
          <Form.Item name="specific_days" label="Days"
            rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one day' }]}>
            <Checkbox.Group options={DAY_OPTIONS} />
          </Form.Item>
        )}
        {frequency === 'specific_date' && (
          <Form.Item name="specific_date" label="Day of month (1–31)" rules={[{ required: true }]}>
            <InputNumber min={1} max={31} style={{ width: 120 }} />
          </Form.Item>
        )}
        {frequency === 'interval' && (
          <Form.Item name="interval_days" label="Every how many days" rules={[{ required: true }]}>
            <InputNumber min={1} max={365} style={{ width: 140 }} addonAfter="days" />
          </Form.Item>
        )}

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="time_of_day" label="Time of day" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} minuteStep={15} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="timezone" label="Timezone" rules={[{ required: true }]}>
              <Select showSearch>
                {COMMON_TIMEZONES.map((tz) => (
                  <Select.Option key={tz} value={tz}>{tz}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="start_date" label="Start date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="end_date" label="End date (optional)">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" orientationMargin={0}>
          <Text type="secondary" style={{ fontSize: 12 }}>Ticket Assignment</Text>
        </Divider>

        {/* ── Ticket Assignment ── */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="company_id" label="Company">
              <Select allowClear showSearch placeholder="Select company"
                optionFilterProp="label" options={companies} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="team_id" label="Team">
              <Select allowClear showSearch placeholder="Select team"
                optionFilterProp="label" options={teams} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="contact_user_id" label="Contact (email replies)"
          tooltip="If set, recurring ticket notifications are sent to this user's email; otherwise the company email is used">
          <Select allowClear showSearch placeholder="Select contact user"
            optionFilterProp="label" options={contacts} />
        </Form.Item>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="ticket_type_id" label="Ticket type">
              <Select allowClear showSearch placeholder="Select type"
                optionFilterProp="label" options={ticketTypes} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="ticket_status" label="Default status">
              <Select allowClear showSearch placeholder="open"
                optionFilterProp="label"
                options={statuses.length ? statuses : [{ label: 'Open', value: 'open' }]} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" orientationMargin={0}>
          <Text type="secondary" style={{ fontSize: 12 }}>Ticket Settings</Text>
        </Divider>

        {/* ── Ticket Settings ── */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="ticket_priority" label="Priority (1=highest, blank=lowest)">
              <InputNumber min={1} placeholder="Lowest" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              {isEdit ? 'Save changes' : 'Create'}
            </Button>
            <Button onClick={onCancel}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </>
  )
}
