'use client'

import {
  Layout,
  Card,
  Typography,
  Button,
  Space,
  Tag,
  List,
  Avatar,
  Segmented,
  DatePicker,
  Table,
  Spin,
  Empty,
  Row,
  Col,
  Statistic,
  Tabs,
  Modal,
  Select,
  message,
  Input,
  Form,
  Flex,
} from 'antd'
import {
  ArrowLeftOutlined,
  TeamOutlined,
  BarChartOutlined,
  UserOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  UserDeleteOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import dayjs, { Dayjs } from 'dayjs'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import { createClient } from '@/utils/supabase/client'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

type ReportPeriod = 'week' | 'month' | 'custom'

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
  joined_at: string
  user_name?: string
  user_email?: string
  user_avatar_url?: string | null
}

interface TeamData {
  id: string
  name: string
  type: string | null
  created_by: string
  created_at: string
  creator_name?: string
  members: TeamMember[]
}

interface ReportRow {
  id: string
  user_id: string
  user_name: string
  user_email?: string
  todo_id: number
  ticket_title?: string
  start_time: string
  stop_time: string | null
  duration_seconds: number | null
}

interface TeamDetailContentProps {
  user: User
  team: TeamData
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface UserOption {
  id: string
  full_name: string | null
  email: string | null
  avatar_url?: string | null
}

export default function TeamDetailContent({ user: currentUser, team }: TeamDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>(team.members)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('week')
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [reportSessions, setReportSessions] = useState<ReportRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addUserId, setAddUserId] = useState<string | null>(null)
  const [addRole, setAddRole] = useState<string>('member')
  const [addLoading, setAddLoading] = useState(false)
  const [usersList, setUsersList] = useState<UserOption[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [removeLoadingId, setRemoveLoadingId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState(team.name)
  const [teamType, setTeamType] = useState<string | null>(team.type)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editForm] = Form.useForm()
  const supabase = createClient()

  const memberUserIds = useMemo(() => members.map((m) => m.user_id), [members])
  const isCreator = currentUser.id === team.created_by

  // Sync display when team prop changes
  useEffect(() => {
    setTeamName(team.name)
    setTeamType(team.type)
  }, [team.id, team.name, team.type])

  // Sync members when team prop changes (e.g. navigation)
  useEffect(() => {
    setMembers(team.members)
  }, [team.id, team.members.length])

  const fetchUsers = async () => {
    setUsersLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, avatar_url')
        .order('full_name', { ascending: true, nullsFirst: false })
      if (error) throw error
      setUsersList(data || [])
    } catch {
      message.error('Failed to load users')
      setUsersList([])
    } finally {
      setUsersLoading(false)
    }
  }

  const openAddModal = () => {
    setAddUserId(null)
    setAddRole('member')
    setAddModalOpen(true)
    fetchUsers()
  }

  const handleAddMember = async () => {
    if (!addUserId) {
      message.warning('Please select a user')
      return
    }
    setAddLoading(true)
    try {
      const { data: newRow, error } = await supabase
        .from('team_members')
        .insert({ team_id: team.id, user_id: addUserId, role: addRole })
        .select('id, team_id, user_id, role, joined_at')
        .single()
      if (error) throw error
      const u = usersList.find((x) => x.id === addUserId)
      setMembers((prev) => [
        ...prev,
        {
          id: newRow.id,
          team_id: newRow.team_id,
          user_id: newRow.user_id,
          role: newRow.role,
          joined_at: newRow.joined_at,
          user_name: u?.full_name || u?.email || 'Unknown',
          user_email: u?.email ?? '',
          user_avatar_url: u?.avatar_url ?? null,
        },
      ])
      message.success('Member added')
      setAddModalOpen(false)
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message || 'Failed to add member')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemoveMember = async (member: TeamMember) => {
    if (member.user_id === team.created_by) {
      message.warning('Cannot remove the team creator')
      return
    }
    if (!confirm(`Remove ${member.user_name} from this team?`)) return
    setRemoveLoadingId(member.id)
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', member.id)
      if (error) throw error
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      message.success('Member removed')
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message || 'Failed to remove member')
    } finally {
      setRemoveLoadingId(null)
    }
  }

  const openEditModal = () => {
    editForm.setFieldsValue({ name: teamName, type: teamType ?? undefined })
    setEditModalOpen(true)
  }

  const handleSaveTeam = async () => {
    try {
      const values = await editForm.validateFields()
      const name = (values.name ?? '').trim()
      if (!name) {
        message.warning('Name is required')
        return
      }
      setEditLoading(true)
      const { error } = await supabase
        .from('teams')
        .update({ name, type: values.type || null })
        .eq('id', team.id)
      if (error) throw error
      setTeamName(name)
      setTeamType(values.type || null)
      message.success('Team updated')
      setEditModalOpen(false)
    } catch (e: unknown) {
      const err = e as { message?: string }
      if (err?.message && !err.message.includes('validateFields')) {
        message.error(err.message || 'Failed to update team')
      }
    } finally {
      setEditLoading(false)
    }
  }

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = dayjs()
    if (reportPeriod === 'week') {
      return {
        rangeStart: now.subtract(7, 'day').startOf('day'),
        rangeEnd: now.endOf('day'),
      }
    }
    if (reportPeriod === 'month') {
      return {
        rangeStart: now.subtract(30, 'day').startOf('day'),
        rangeEnd: now.endOf('day'),
      }
    }
    if (reportPeriod === 'custom' && customRange?.[0] && customRange?.[1]) {
      return {
        rangeStart: customRange[0].startOf('day'),
        rangeEnd: customRange[1].endOf('day'),
      }
    }
    return { rangeStart: null, rangeEnd: null }
  }, [reportPeriod, customRange])

  const fetchReport = async () => {
    if (memberUserIds.length === 0 || !rangeStart || !rangeEnd) {
      setReportSessions([])
      return
    }
    setReportLoading(true)
    try {
      const startIso = rangeStart.toISOString()
      const endIso = rangeEnd.toISOString()

      const { data, error } = await supabase
        .from('todo_time_tracker')
        .select(`
          id,
          user_id,
          todo_id,
          start_time,
          stop_time,
          duration_seconds,
          ticket:tickets(id, title),
          user:users!todo_time_tracker_user_id_fkey(id, full_name, email)
        `)
        .in('user_id', memberUserIds)
        .gte('start_time', startIso)
        .lte('start_time', endIso)
        .order('start_time', { ascending: false })

      if (error) throw error

      const rows: ReportRow[] = (data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        user_name: r.user?.full_name || r.user?.email || 'Unknown',
        user_email: r.user?.email,
        todo_id: r.todo_id,
        ticket_title: r.ticket?.title,
        start_time: r.start_time,
        stop_time: r.stop_time,
        duration_seconds: r.duration_seconds,
      }))
      setReportSessions(rows)
    } catch {
      setReportSessions([])
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    if (rangeStart && rangeEnd) fetchReport()
    else if (!rangeStart && !rangeEnd && memberUserIds.length > 0) setReportSessions([])
  }, [reportPeriod, customRange, memberUserIds.length, rangeStart?.toISOString(), rangeEnd?.toISOString()])

  const reportColumns: ColumnsType<ReportRow> = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <div>
            <div>{r.user_name}</div>
            {r.user_email && <Text type="secondary" style={{ fontSize: 12 }}>{r.user_email}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_, r) => (
        <Space>
          <Text strong>#{r.todo_id}</Text>
          {r.ticket_title ? r.ticket_title : '-'}
        </Space>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration_seconds',
      key: 'duration',
      render: (v: number | null) => formatDuration(v),
    },
    {
      title: 'Start',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (d: string) => <DateDisplay date={d} format="detailed" />,
    },
    {
      title: 'Stop',
      dataIndex: 'stop_time',
      key: 'stop_time',
      render: (d: string | null) => (d ? <DateDisplay date={d} format="detailed" /> : '-'),
    },
  ]

  const summaryByUser = useMemo(() => {
    const map: Record<string, { name: string; seconds: number; tickets: Set<number> }> = {}
    reportSessions.forEach((s) => {
      if (!map[s.user_id]) {
        map[s.user_id] = { name: s.user_name, seconds: 0, tickets: new Set() }
      }
      map[s.user_id].seconds += s.duration_seconds ?? 0
      map[s.user_id].tickets.add(s.todo_id)
    })
    return Object.entries(map).map(([userId, v]) => ({
      user_id: userId,
      name: v.name,
      totalSeconds: v.seconds,
      ticketCount: v.tickets.size,
    }))
  }, [reportSessions])

  const totalSeconds = reportSessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)

  const tabItems = [
  {
    key: 'info',
    label: (
      <span>
        <InfoCircleOutlined /> Info
      </span>
    ),
    children: (
      <Card>
        <Title level={5} style={{ marginTop: 0 }}>Team Information</Title>
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Text type="secondary">Name</Text>
            <div><Text strong>{teamName}</Text></div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Type</Text>
            <div>{teamType ? <Tag>{teamType}</Tag> : '-'}</div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Created by</Text>
            <div>{team.creator_name}</div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Created at</Text>
            <div><DateDisplay date={team.created_at} format="detailed" /></div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Member count</Text>
            <div>{members.length} members</div>
          </Col>
        </Row>
      </Card>
    ),
  },
  {
    key: 'members',
    label: (
      <span>
        <TeamOutlined /> Team Members ({members.length})
      </span>
    ),
    children: (
      <Card
        title="Members"
        extra={
          isCreator ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
              Add member
            </Button>
          ) : null
        }
      >
        {members.length === 0 ? (
          <Empty description="No members yet">
            {isCreator && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
                Add member
              </Button>
            )}
          </Empty>
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={members}
            renderItem={(m) => (
              <List.Item
                actions={
                  isCreator && m.user_id !== team.created_by
                    ? [
                        <Button
                          key="remove"
                          type="text"
                          danger
                          size="small"
                          icon={<UserDeleteOutlined />}
                          loading={removeLoadingId === m.id}
                          onClick={() => handleRemoveMember(m)}
                        >
                          Remove
                        </Button>,
                      ]
                    : undefined
                }
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} src={m.user_avatar_url} />}
                  title={
                    <Space>
                      {m.user_name}
                      {m.user_id === team.created_by && (
                        <Tag color="blue">Creator</Tag>
                      )}
                      {m.user_id !== team.created_by && <Tag>{m.role}</Tag>}
                    </Space>
                  }
                  description={m.user_email}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    ),
  },
  {
    key: 'report',
    label: (
      <span>
        <BarChartOutlined /> Report
      </span>
    ),
    children: (
      <Card>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={16} align="middle">
            <Col>
              <Segmented
                value={reportPeriod}
                onChange={(v) => setReportPeriod(v as ReportPeriod)}
                options={[
                  { label: 'This week', value: 'week' },
                  { label: 'This month', value: 'month' },
                  { label: 'Custom', value: 'custom' },
                ]}
              />
            </Col>
            {reportPeriod === 'custom' && (
              <Col>
                <RangePicker
                  value={customRange}
                  onChange={(dates) => setCustomRange(dates as [Dayjs, Dayjs] | null)}
                />
                {!customRange && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Select date range to view report
                  </Text>
                )}
              </Col>
            )}
          </Row>

          {rangeStart && rangeEnd && (
            <Row gutter={24}>
              <Col>
                <Statistic
                  title="Total time"
                  value={Math.round(totalSeconds / 60)}
                  suffix="min"
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col>
                <Statistic title="Sessions" value={reportSessions.length} />
              </Col>
            </Row>
          )}

          {summaryByUser.length > 0 && (
            <div>
              <Text strong>Summary by user</Text>
              <Row gutter={16} style={{ marginTop: 8 }}>
                {summaryByUser.map((u) => (
                  <Col key={u.user_id} span={8}>
                    <Card size="small">
                      <Statistic
                        title={u.name}
                        value={Math.round(u.totalSeconds / 60)}
                        suffix="min"
                      />
                      <Text type="secondary">{u.ticketCount} ticket</Text>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}

          <Spin spinning={reportLoading}>
            <Table
              size="small"
              columns={reportColumns}
              dataSource={reportSessions}
              rowKey="id"
              pagination={{ pageSize: 10, showTotal: (t) => `Total ${t} sessions` }}
              locale={{ emptyText: 'No time tracker data for this period' }}
            />
          </Spin>
        </Space>
      </Card>
    ),
  },
]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/teams')}>
                Back
              </Button>
              {isCreator && (
                <Button type="default" icon={<EditOutlined />} onClick={openEditModal}>
                  Edit team
                </Button>
              )}
            </Flex>
            <Title level={3} style={{ marginTop: 0 }}>
              {teamName}
            </Title>
            {teamType && <Tag>{teamType}</Tag>}
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <Text type="secondary">
                Created by {team.creator_name} · <DateDisplay date={team.created_at} />
              </Text>
            </div>
            <Tabs defaultActiveKey="info" items={tabItems} />
            <Modal
              title="Edit team"
              open={editModalOpen}
              onOk={handleSaveTeam}
              onCancel={() => setEditModalOpen(false)}
              confirmLoading={editLoading}
              okText="Save"
              destroyOnClose
            >
              <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item name="name" label="Team name" rules={[{ required: true, message: 'Name is required' }]}>
                  <Input placeholder="Team name" />
                </Form.Item>
                <Form.Item name="type" label="Type">
                  <Input placeholder="e.g. Engineering, Support" />
                </Form.Item>
              </Form>
            </Modal>
            <Modal
              title="Add team member"
              open={addModalOpen}
              onOk={handleAddMember}
              onCancel={() => setAddModalOpen(false)}
              confirmLoading={addLoading}
              okText="Add"
              destroyOnClose
            >
              <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>User</Text>
                  <Select
                    placeholder="Select user"
                    style={{ width: '100%' }}
                    value={addUserId}
                    onChange={setAddUserId}
                    loading={usersLoading}
                    showSearch
                    optionFilterProp="label"
                    options={usersList
                      .filter((u) => !memberUserIds.includes(u.id))
                      .map((u) => ({
                        value: u.id,
                        label: `${u.full_name || u.email || 'Unknown'}${u.email ? ` (${u.email})` : ''}`,
                      }))}
                    notFoundContent={usersLoading ? 'Loading...' : 'No users to add or all users are already members'}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Role</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={addRole}
                    onChange={setAddRole}
                    options={[
                      { value: 'member', label: 'Member' },
                      { value: 'manager', label: 'Manager' },
                    ]}
                  />
                </div>
              </Space>
            </Modal>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}
