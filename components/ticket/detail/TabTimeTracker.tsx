'use client'

import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StopOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Button,
  DatePicker,
  Empty,
  Flex,
  Form,
  InputNumber,
  List,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'

const { Text } = Typography
const { RangePicker } = DatePicker

function disabledDateNotAfterToday(current: Dayjs) {
  return !!current && current.isAfter(dayjs(), 'day')
}

function getDisabledTimeNotAfterNow(date: Dayjs | null | undefined) {
  const now = dayjs()
  if (!date || !date.isSame(now, 'day')) {
    return {}
  }
  return {
    disabledHours: () => {
      const h: number[] = []
      for (let i = now.hour() + 1; i < 24; i++) h.push(i)
      return h
    },
    disabledMinutes: (selectedHour: number) => {
      if (selectedHour < now.hour()) return []
      if (selectedHour > now.hour()) return Array.from({ length: 60 }, (_, i) => i)
      const m: number[] = []
      for (let i = now.minute() + 1; i < 60; i++) m.push(i)
      return m
    },
    disabledSeconds: (selectedHour: number, selectedMinute: number) => {
      if (selectedHour !== now.hour() || selectedMinute !== now.minute()) return []
      const s: number[] = []
      for (let i = now.second() + 1; i < 60; i++) s.push(i)
      return s
    },
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || res.statusText || 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export type TimeTrackerManualUserOption = { value: string; label: string }

export interface TabTimeTrackerProps {
  ticketData: { id: number }
  totalTimeSeconds: number
  activeTimeTracker: unknown
  currentTime: number
  formatTime: (seconds: number) => string
  timeTrackerSessions: unknown[]
  timeTrackerLoading?: boolean
  onStartTimeTracker: (jobType?: string | null) => void | Promise<void>
  onStopTimeTracker: () => void
  currentUserId: string
  onTimeTrackingChanged: () => Promise<void>
  /** Admin: edit/delete/add manual for any user on this ticket */
  canManageOthersTime?: boolean
  manualUserOptions?: TimeTrackerManualUserOption[]
  /** Admin/manager: override reported duration (billing) without changing tracked time */
  canAdjustReportedDuration?: boolean
}

export default function TabTimeTracker({
  ticketData,
  totalTimeSeconds,
  activeTimeTracker,
  currentTime,
  formatTime,
  timeTrackerSessions,
  timeTrackerLoading = false,
  onStartTimeTracker,
  onStopTimeTracker,
  currentUserId,
  onTimeTrackingChanged,
  canManageOthersTime = false,
  manualUserOptions = [],
  canAdjustReportedDuration = false,
}: TabTimeTrackerProps) {
  const ticketId = ticketData?.id as number
  const [manualOpen, setManualOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<Record<string, unknown> | null>(null)
  const [mutating, setMutating] = useState(false)
  const [manualForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustSession, setAdjustSession] = useState<Record<string, unknown> | null>(null)
  const [adjustForm] = Form.useForm()

  type JobTypeOpt = { slug: string; title: string }
  const [jobTypeOptions, setJobTypeOptions] = useState<JobTypeOpt[]>([])
  const [timerJobType, setTimerJobType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await apiFetch<JobTypeOpt[]>('/api/job-types')
        if (cancelled) return
        setJobTypeOptions(Array.isArray(rows) ? rows : [])
        setTimerJobType((prev) => {
          if (prev != null) return prev
          const other = rows.find((r) => r.slug === 'other')
          return other?.slug ?? rows[0]?.slug ?? null
        })
      } catch {
        if (!cancelled) setJobTypeOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isOwner = (session: Record<string, unknown>) =>
    String(
      session.userId ?? session.user_id ?? (session.user as { id?: string } | undefined)?.id ?? ''
    ) === String(currentUserId)

  const openManual = () => {
    manualForm.resetFields()
    const base: Record<string, unknown> = {
      hours: 0,
      minutes: 30,
      seconds: 0,
      startedAt: dayjs(),
    }
    if (canManageOthersTime) {
      base.forUserId = currentUserId
    }
    base.job_type = timerJobType ?? jobTypeOptions.find((o) => o.slug === 'other')?.slug ?? jobTypeOptions[0]?.slug
    manualForm.setFieldsValue(base)
    setManualOpen(true)
  }

  const submitManual = async () => {
    const v = await manualForm.validateFields()
    const hours = Number(v.hours) || 0
    const minutes = Number(v.minutes) || 0
    const secs = Number(v.seconds) || 0
    const durationSeconds = hours * 3600 + minutes * 60 + secs
    if (durationSeconds < 1) {
      message.error('Set duration to at least 1 second')
      throw new Error('duration')
    }
    const startedAt: Dayjs = v.startedAt
    if (!startedAt || !startedAt.isValid()) {
      message.error('Invalid date')
      throw new Error('date')
    }
    if (startedAt.isAfter(dayjs())) {
      message.error('Worked start cannot be in the future')
      throw new Error('future')
    }
    const workEnd = startedAt.add(durationSeconds, 'second')
    if (workEnd.isAfter(dayjs())) {
      message.error('Total duration would end in the future — reduce duration or pick an earlier start')
      throw new Error('endfuture')
    }
    setMutating(true)
    try {
      const payload: Record<string, unknown> = {
        action: 'manual',
        duration_seconds: durationSeconds,
        started_at: startedAt.toISOString(),
      }
      if (canManageOthersTime && v.forUserId) {
        payload.user_id = v.forUserId
      }
      if (v.job_type != null && String(v.job_type).trim() !== '') {
        payload.job_type = String(v.job_type).trim()
      }
      await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      message.success('Manual time added')
      setManualOpen(false)
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to add time')
      throw e
    } finally {
      setMutating(false)
    }
  }

  const openEdit = (session: Record<string, unknown>) => {
    setEditingSession(session)
    editForm.setFieldsValue({
      range: [dayjs(session.start_time as string), dayjs(session.stop_time as string)],
      job_type: (session.job_type as string | null | undefined) ?? undefined,
    })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!editingSession) throw new Error('no session')
    const v = await editForm.validateFields()
    const [start, end] = v.range as [Dayjs, Dayjs]
    if (!start || !end || !end.isAfter(start)) {
      message.error('End must be after start')
      throw new Error('range')
    }
    const now = dayjs()
    if (start.isAfter(now) || end.isAfter(now)) {
      message.error('Start and stop cannot be in the future (max: today, until now)')
      throw new Error('future')
    }
    setMutating(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: editingSession.id,
          start_time: start.toISOString(),
          stop_time: end.toISOString(),
          job_type:
            v.job_type != null && String(v.job_type).trim() !== '' ? String(v.job_type).trim() : null,
        }),
      })
      message.success('Time entry updated')
      setEditOpen(false)
      setEditingSession(null)
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to update')
      throw e
    } finally {
      setMutating(false)
    }
  }

  const openAdjustReported = (session: Record<string, unknown>) => {
    setAdjustSession(session)
    let rep = 0
    if (session.reported_duration_seconds != null && Number.isFinite(Number(session.reported_duration_seconds))) {
      rep = Number(session.reported_duration_seconds)
    } else if (session.duration_adjustment != null && Number.isFinite(Number(session.duration_adjustment))) {
      rep = Number(session.duration_adjustment)
    } else {
      rep = Number(session.duration_seconds) || 0
    }
    adjustForm.setFieldsValue({
      reportedMinutes: Math.round((Math.max(0, rep) / 60) * 100) / 100,
    })
    setAdjustOpen(true)
  }

  const submitAdjustReported = async () => {
    if (!adjustSession) return
    const v = await adjustForm.validateFields()
    const mins = Math.max(0, Number(v.reportedMinutes) || 0)
    const secs = Math.min(2147483647, Math.round(mins * 60))
    setMutating(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: adjustSession.id,
          duration_adjustment: secs,
        }),
      })
      message.success('Reported duration updated')
      setAdjustOpen(false)
      setAdjustSession(null)
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to update')
      throw e
    } finally {
      setMutating(false)
    }
  }

  const deleteSession = async (session: Record<string, unknown>) => {
    setMutating(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/time-tracker?session_id=${encodeURIComponent(String(session.id))}`, {
        method: 'DELETE',
      })
      message.success('Time entry removed')
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setMutating(false)
    }
  }

  /** Admin: stop another user’s running timer from the list (own timer uses the main Stop button). */
  const stopTimerSessionForRow = async (session: Record<string, unknown>) => {
    setMutating(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', session_id: session.id }),
      })
      message.success('Timer stopped')
      await onTimeTrackingChanged()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to stop timer')
    } finally {
      setMutating(false)
    }
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ width: '100%' }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
          <Space wrap>
            <ClockCircleOutlined />
            <Text strong>Time Tracker</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total (reported): {formatTime(totalTimeSeconds + (activeTimeTracker ? currentTime : 0))}
            </Text>
          </Space>
          <Button type="default" size="small" icon={<PlusOutlined />} onClick={openManual}>
            Add manual
          </Button>
        </Flex>
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap align="center">
            {jobTypeOptions.length > 0 ? (
              <Select
                style={{ minWidth: 200, maxWidth: 320 }}
                placeholder="Job type"
                value={timerJobType ?? undefined}
                onChange={(v) => setTimerJobType(v ?? null)}
                options={jobTypeOptions.map((o) => ({ value: o.slug, label: o.title }))}
                disabled={!!activeTimeTracker}
                allowClear
              />
            ) : null}
            {activeTimeTracker ? (
              <>
                <Button
                  type="primary"
                  danger
                  icon={<StopOutlined />}
                  onClick={onStopTimeTracker}
                  loading={timeTrackerLoading}
                >
                  Stop
                </Button>
                <Text strong style={{ fontSize: 18 }}>
                  {formatTime(currentTime)}
                </Text>
                <Text type="secondary">(running)</Text>
              </>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => void onStartTimeTracker(timerJobType)}
                loading={timeTrackerLoading}
              >
                Start Timer
              </Button>
            )}
          </Space>
          {timeTrackerSessions.length > 0 ? (
            <List
              size="small"
              dataSource={timeTrackerSessions as Record<string, unknown>[]}
              renderItem={(session: Record<string, unknown>) => {
                const owner = isOwner(session)
                const completed = !!session.stop_time
                const canMutate = owner || canManageOthersTime
                const showRowStop =
                  canManageOthersTime &&
                  !completed &&
                  session.tracker_type === 'timer' &&
                  !owner
                return (
                  <List.Item
                    actions={
                      canMutate
                        ? [
                            ...(showRowStop
                              ? [
                                  <Button
                                    type="link"
                                    size="small"
                                    key="stoprow"
                                    icon={<StopOutlined />}
                                    onClick={() => void stopTimerSessionForRow(session)}
                                    disabled={mutating}
                                  >
                                    Stop
                                  </Button>,
                                ]
                              : []),
                            ...(completed
                              ? [
                                  <Button
                                    type="link"
                                    size="small"
                                    key="edit"
                                    icon={<EditOutlined />}
                                    onClick={() => openEdit(session)}
                                    disabled={mutating}
                                  >
                                    Edit
                                  </Button>,
                                ]
                              : []),
                            ...(completed && canAdjustReportedDuration
                              ? [
                                  <Button
                                    type="link"
                                    size="small"
                                    key="adj"
                                    onClick={() => openAdjustReported(session)}
                                    disabled={mutating}
                                  >
                                    Reported time
                                  </Button>,
                                ]
                              : []),
                            <Popconfirm
                              key="del"
                              title="Remove this time entry?"
                              description={
                                completed
                                  ? undefined
                                  : 'This will discard the running timer without saving duration.'
                              }
                              onConfirm={() => deleteSession(session)}
                              okText="Remove"
                              okButtonProps={{ danger: true }}
                            >
                              <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={mutating}>
                                Delete
                              </Button>
                            </Popconfirm>,
                          ]
                        : []
                    }
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          icon={<UserOutlined />}
                          size="small"
                          src={(session.user as { avatar_url?: string } | undefined)?.avatar_url}
                        />
                      }
                      title={
                        <Space size="small" wrap>
                          <Text strong style={{ fontSize: 13 }}>
                            {(session.user as { full_name?: string; email?: string } | undefined)?.full_name ||
                              (session.user as { email?: string } | undefined)?.email ||
                              'Unknown'}
                          </Text>
                          {!completed && <Tag color="processing">Active</Tag>}
                          {session.tracker_type === 'manual' && <Tag color="default">Manual</Tag>}
                          {session.tracker_type === 'timer' && completed ? (
                            <Tag color="blue">Timer</Tag>
                          ) : null}
                          {(session.job_type_title as string | null) || (session.job_type as string | null) ? (
                            <Tag color="purple">
                              {(session.job_type_title as string) || (session.job_type as string)}
                            </Tag>
                          ) : null}
                        </Space>
                      }
                      description={
                        <Space orientation="vertical" size={0}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Started: <DateDisplay date={session.start_time as string} />
                          </Text>
                          {completed ? (
                            <>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Stopped: <DateDisplay date={session.stop_time as string} />
                              </Text>
                              <Text strong style={{ fontSize: 12 }}>
                                Tracked: {formatTime(Number(session.duration_seconds) || 0)}
                                {Number(session.reported_duration_seconds) !==
                                Number(session.duration_seconds) ? (
                                  <>
                                    {' '}
                                    · Reported:{' '}
                                    {formatTime(
                                      Number(session.reported_duration_seconds) ||
                                        Number(session.duration_seconds) ||
                                        0
                                    )}
                                  </>
                                ) : null}
                              </Text>
                            </>
                          ) : null}
                        </Space>
                      }
                    />
                  </List.Item>
                )
              }}
            />
          ) : (
            <Empty description="No time tracking sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Space>
      </div>

      <Modal
        title="Add manual time"
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        onOk={submitManual}
        confirmLoading={mutating}
        destroyOnClose
      >
        <Form form={manualForm} layout="vertical" style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Log time you already spent. &quot;Worked start&quot; is when the work began; duration runs forward from
            that moment.
            {canManageOthersTime ? ' As admin, you can log time for another user below.' : ''}
          </Text>
          {canManageOthersTime && manualUserOptions.length > 0 ? (
            <Form.Item
              name="forUserId"
              label="User"
              rules={[{ required: true, message: 'Select a user' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={manualUserOptions}
                placeholder="Who worked this time"
                style={{ width: '100%' }}
              />
            </Form.Item>
          ) : null}
          <Form.Item
            name="job_type"
            label="Job type"
            rules={jobTypeOptions.length ? [{ required: true, message: 'Select job type' }] : []}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="What was this work for?"
              style={{ width: '100%' }}
              options={jobTypeOptions.map((o) => ({ value: o.slug, label: o.title }))}
            />
          </Form.Item>
          <Space wrap>
            <Form.Item
              name="hours"
              label="Hours"
              rules={[{ required: true }]}
              style={{ marginBottom: 8, width: 100 }}
            >
              <InputNumber min={0} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="minutes"
              label="Minutes"
              rules={[{ required: true }]}
              style={{ marginBottom: 8, width: 100 }}
            >
              <InputNumber min={0} max={59} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="seconds"
              label="Seconds"
              rules={[{ required: true }]}
              style={{ marginBottom: 8, width: 100 }}
            >
              <InputNumber min={0} max={59} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item
            name="startedAt"
            label="Worked start"
            rules={[
              { required: true, message: 'Pick when work started' },
              {
                validator: (_: unknown, value: Dayjs | null) => {
                  if (!value) return Promise.resolve()
                  if (value.isAfter(dayjs())) {
                    return Promise.reject(new Error('Cannot be in the future'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <DatePicker
              showTime
              style={{ width: '100%' }}
              format="YYYY-MM-DD HH:mm"
              disabledDate={disabledDateNotAfterToday}
              disabledTime={(d) => getDisabledTimeNotAfterNow(d)}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit time entry"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditingSession(null)
        }}
        onOk={submitEdit}
        confirmLoading={mutating}
        destroyOnClose
        width={560}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="range"
            label="Start — Stop"
            rules={[{ required: true, message: 'Select start and end' }]}
          >
            <RangePicker
              showTime
              style={{ width: '100%' }}
              format="YYYY-MM-DD HH:mm"
              disabledDate={disabledDateNotAfterToday}
              disabledTime={(d) => getDisabledTimeNotAfterNow(d)}
            />
          </Form.Item>
          <Form.Item name="job_type" label="Job type">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="What was this work for?"
              style={{ width: '100%' }}
              options={jobTypeOptions.map((o) => ({ value: o.slug, label: o.title }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Adjust reported duration"
        open={adjustOpen}
        onCancel={() => {
          setAdjustOpen(false)
          setAdjustSession(null)
        }}
        onOk={submitAdjustReported}
        confirmLoading={mutating}
        destroyOnClose
        width={480}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          This value is used for billing and customer time reports. Tracked time on the entry is unchanged.
        </Text>
        {adjustSession ? (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Tracked duration: {formatTime(Number(adjustSession.duration_seconds) || 0)}
          </Text>
        ) : null}
        <Form form={adjustForm} layout="vertical">
          <Form.Item
            name="reportedMinutes"
            label="Reported duration (minutes)"
            rules={[{ required: true, message: 'Enter minutes' }]}
          >
            <InputNumber min={0} max={35791394} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
