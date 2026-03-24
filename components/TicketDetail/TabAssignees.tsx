'use client'

import {
  Card,
  List,
  Space,
  Typography,
  Avatar,
  Empty,
  Tag,
  Button,
  Modal,
  Form,
  InputNumber,
  message,
  Popconfirm,
  DatePicker,
} from 'antd'
import {
  UserOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import DateDisplay from '../DateDisplay'
import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'

const { Text } = Typography
const { RangePicker } = DatePicker

/** Calendar: no days after today */
function disabledDateNotAfterToday(current: Dayjs) {
  return !!current && current.isAfter(dayjs(), 'day')
}

/** If picking today, cannot pick a time after now */
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

interface TabAssigneesProps {
  ticketData: any
  teamMembers: any[]
  loading: boolean
  totalTimeSeconds: number
  activeTimeTracker: any
  currentTime: number
  formatTime: (seconds: number) => string
  timeTrackerSessions: any[]
  timeTrackerLoading?: boolean
  onStartTimeTracker: () => void
  onStopTimeTracker: () => void
  currentUserId: string
  onTimeTrackingChanged: () => Promise<void>
}

export default function TabAssignees({
  ticketData,
  teamMembers,
  loading,
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
}: TabAssigneesProps) {
  const ticketId = ticketData?.id as number
  const [manualOpen, setManualOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<any>(null)
  const [mutating, setMutating] = useState(false)
  const [manualForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const isOwner = (session: any) =>
    String(session.userId ?? session.user_id ?? session.user?.id ?? '') === String(currentUserId)

  const openManual = () => {
    manualForm.resetFields()
    manualForm.setFieldsValue({
      hours: 0,
      minutes: 30,
      seconds: 0,
      startedAt: dayjs(),
    })
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
      await apiFetch(`/api/tickets/${ticketId}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual',
          duration_seconds: durationSeconds,
          started_at: startedAt.toISOString(),
        }),
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

  const openEdit = (session: any) => {
    setEditingSession(session)
    editForm.setFieldsValue({
      range: [dayjs(session.start_time), dayjs(session.stop_time)],
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

  const deleteSession = async (session: any) => {
    setMutating(true)
    try {
      await apiFetch(`/api/tickets/${ticketId}/time-tracker?session_id=${encodeURIComponent(session.id)}`, {
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

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Card
        title={
          <Space wrap>
            <ClockCircleOutlined />
            <Text strong>Time Tracker</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total: {formatTime(totalTimeSeconds + (activeTimeTracker ? currentTime : 0))}
            </Text>
          </Space>
        }
        size="small"
        extra={
          <Button type="default" size="small" icon={<PlusOutlined />} onClick={openManual}>
            Add manual
          </Button>
        }
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
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
                onClick={onStartTimeTracker}
                loading={timeTrackerLoading}
              >
                Start Timer
              </Button>
            )}
          </Space>
          {timeTrackerSessions.length > 0 ? (
            <List
              size="small"
              dataSource={timeTrackerSessions}
              renderItem={(session: any) => {
                const owner = isOwner(session)
                const completed = !!session.stop_time
                return (
                  <List.Item
                    actions={
                      owner
                        ? [
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
                      avatar={<Avatar icon={<UserOutlined />} size="small" src={session.user?.avatar_url} />}
                      title={
                        <Space size="small" wrap>
                          <Text strong style={{ fontSize: 13 }}>
                            {session.user?.full_name || session.user?.email || 'Unknown'}
                          </Text>
                          {!session.stop_time && <Tag color="processing">Active</Tag>}
                          {session.tracker_type === 'manual' && <Tag color="default">Manual</Tag>}
                          {session.tracker_type === 'timer' && session.stop_time && (
                            <Tag color="blue">Timer</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <Space orientation="vertical" size={0}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Started: <DateDisplay date={session.start_time} />
                          </Text>
                          {session.stop_time && (
                            <>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Stopped: <DateDisplay date={session.stop_time} />
                              </Text>
                              <Text strong style={{ fontSize: 12 }}>
                                Duration: {formatTime(session.duration_seconds || 0)}
                              </Text>
                            </>
                          )}
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
      </Card>

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
          </Text>
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

      <Card title="Assignees" size="small" loading={loading}>
        {ticketData.visibility === 'private' ? (
          <Empty description="No Assignees for this private ticket" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : ticketData.visibility === 'team' && ticketData.team_id ? (
          teamMembers.length > 0 ? (
            <List
              dataSource={teamMembers}
              renderItem={(member: any) => (
                <List.Item>
                  <Space>
                    <Avatar icon={<UserOutlined />} src={member.user?.avatar_url} />
                    <Text>{member.user?.full_name || member.user?.email || 'Unknown'}</Text>
                    {member.role && (
                      <Tag color={member.role === 'manager' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                        {member.role}
                      </Tag>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="No team members" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )
        ) : ticketData.assignees && ticketData.assignees.length > 0 ? (
          <List
            dataSource={ticketData.assignees}
            renderItem={(assignee: any) => (
              <List.Item>
                <Space>
                  <Avatar icon={<UserOutlined />} src={assignee.user?.avatar_url} />
                  <Text>{assignee.user?.full_name || assignee.user?.email || 'Unknown'}</Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="No assignees" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

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
        </Form>
      </Modal>
    </Space>
  )
}
