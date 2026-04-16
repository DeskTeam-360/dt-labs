'use client'

import { ClockCircleOutlined,TeamOutlined } from '@ant-design/icons'
import {
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Empty,
  Layout,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { isValidMyTeamsActivityDateYmd, localTodayYesterday } from '@/lib/my-teams-date'
import { getUserDepartmentAccentColor, getUserPositionAccentColor } from '@/lib/user-work-dropdowns'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'
import { SpaNavLink } from '../SpaNavLink'

dayjs.extend(customParseFormat)

const { Content } = Layout
const { Title, Text } = Typography

function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

type TeamRow = { id: string; name: string; type: string | null; member_count: number }

type MemberRow = {
  user_id: string
  user_name: string
  user_email: string | null
  avatar_url: string | null
  department?: string | null
  position?: string | null
  reported_seconds: number
}

type SessionRow = {
  id: string
  user_id: string
  user_name: string
  ticket_id: number
  ticket_title: string | null
  ticket_type_title?: string | null
  ticket_type_color?: string | null
  start_time: string
  stop_time: string | null
  reported_duration_seconds: number | null
}

type ActivityResponse = {
  date: string
  members: MemberRow[]
  team_hourly_seconds: number[]
  sessions: SessionRow[]
  member_hourly_seconds: number[] | null
}

interface MyTeamsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function MyTeamsContent({ user: currentUser }: MyTeamsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { today, yesterday } = useMemo(() => localTodayYesterday(), [])
  const [dateYmd, setDateYmd] = useState(() => today)

  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  const [activityLoading, setActivityLoading] = useState(false)
  const [activity, setActivity] = useState<ActivityResponse | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [focusMember, setFocusMember] = useState<MemberRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailActivity, setDetailActivity] = useState<ActivityResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setTeamsLoading(true)
      try {
        const res = await fetch('/api/my-teams', { credentials: 'include' })
        const data = (await res.json()) as TeamRow[]
        if (!cancelled && res.ok && Array.isArray(data)) {
          setTeams(data)
          setSelectedTeamId((prev) => prev ?? (data[0]?.id ?? null))
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setTeamsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const buildActivityQuery = useCallback((date: string, memberId?: string) => {
    const start = dayjs(date, 'YYYY-MM-DD').startOf('day')
    const end = dayjs(date, 'YYYY-MM-DD').endOf('day')
    const qs = new URLSearchParams({
      date,
      day_start: start.toISOString(),
      day_end: end.toISOString(),
    })
    if (memberId) qs.set('member_id', memberId)
    return qs
  }, [])

  const loadSummary = useCallback(async (teamId: string, date: string) => {
    setActivityLoading(true)
    try {
      const qs = buildActivityQuery(date)
      const res = await fetch(`/api/my-teams/${teamId}/activity?${qs}`, { credentials: 'include' })
      const json = (await res.json()) as ActivityResponse
      if (res.ok && json && typeof json === 'object' && Array.isArray(json.members)) {
        setActivity(json)
      } else {
        setActivity(null)
      }
    } catch {
      setActivity(null)
    } finally {
      setActivityLoading(false)
    }
  }, [buildActivityQuery])

  const loadMemberDetail = useCallback(async (teamId: string, date: string, memberId: string) => {
    setDetailLoading(true)
    try {
      const qs = buildActivityQuery(date, memberId)
      const res = await fetch(`/api/my-teams/${teamId}/activity?${qs}`, { credentials: 'include' })
      const json = (await res.json()) as ActivityResponse
      if (res.ok && json && typeof json === 'object') {
        setDetailActivity(json)
      } else {
        setDetailActivity(null)
      }
    } catch {
      setDetailActivity(null)
    } finally {
      setDetailLoading(false)
    }
  }, [buildActivityQuery])

  useEffect(() => {
    if (!selectedTeamId) {
      setActivity(null)
      return
    }
    loadSummary(selectedTeamId, dateYmd)
  }, [selectedTeamId, dateYmd, loadSummary])

  useEffect(() => {
    if (!drawerOpen || !focusMember || !selectedTeamId) return
    loadMemberDetail(selectedTeamId, dateYmd, focusMember.user_id)
  }, [drawerOpen, focusMember, selectedTeamId, dateYmd, loadMemberDetail])

  const hourlyChartData = useMemo(() => {
    const bins = activity?.team_hourly_seconds ?? []
    return bins.map((seconds, hour) => ({
      hour: `${hour}:00`,
      seconds: Math.round(seconds),
      hours: Math.round((seconds / 3600) * 100) / 100,
    }))
  }, [activity])

  const memberHourlyChartData = useMemo(() => {
    const bins = detailActivity?.member_hourly_seconds ?? []
    return bins.map((seconds, hour) => ({
      hour: `${hour}:00`,
      seconds: Math.round(seconds),
      hours: Math.round((seconds / 3600) * 100) / 100,
    }))
  }, [detailActivity])

  const memberColumns: ColumnsType<MemberRow> = [
    {
      title: '',
      key: 'member',
      render: (_, row) => {
        const dept = row.department?.trim() || null
        const pos = row.position?.trim() || null
        const deptColor = dept ? getUserDepartmentAccentColor(dept) : undefined
        const posColor = pos ? getUserPositionAccentColor(pos) : undefined
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Avatar src={row.avatar_url ?? undefined} icon={<TeamOutlined />} size="small" />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Text strong style={{ marginRight: 4 }}>
                {row.user_name}
              </Text>
              {dept ? (
                <Tag
                  style={{
                    margin: 0,
                    fontSize: 12,
                    ...(deptColor
                      ? { backgroundColor: deptColor, borderColor: deptColor, color: '#fff' }
                      : {}),
                  }}
                >
                  {dept}
                </Tag>
              ) : null}
              {pos ? (
                <Tag
                  style={{
                    margin: 0,
                    fontSize: 12,
                    ...(posColor
                      ? { backgroundColor: posColor, borderColor: posColor, color: '#fff' }
                      : {}),
                  }}
                >
                  {pos}
                </Tag>
              ) : null}
              {row.user_email ? (
                <Text type="secondary" style={{ fontSize: 12, width: '100%' }}>
                  {row.user_email}
                </Text>
              ) : null}
            </div>
          </div>
        )
      },
    },
    {
      title: '',
      dataIndex: 'reported_seconds',
      key: 'reported_seconds',
      width: 120,
      align: 'right',
      render: (s: number) => (
        <Text strong>
          <ClockCircleOutlined style={{ marginRight: 6 }} />
          {formatDuration(s)}
        </Text>
      ),
    },
  ]

  const sessionColumns: ColumnsType<SessionRow> = [
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_, row) => (
        <SpaNavLink href={`/tickets/${row.ticket_id}`} style={{ fontWeight: 500 }}>
          #{row.ticket_id} {row.ticket_title || '—'}
        </SpaNavLink>
      ),
    },
    {
      title: 'Type',
      key: 'ticket_type',
      width: 130,
      render: (_, row) => {
        const title = row.ticket_type_title
        const color = row.ticket_type_color
        if (!title) return <Text type="secondary">—</Text>
        return (
          <Tag
            style={{
              margin: 0,
              ...(color
                ? { backgroundColor: color, borderColor: color, color: '#fff' }
                : {}),
            }}
          >
            {title}
          </Tag>
        )
      },
    },
    {
      title: 'Start',
      dataIndex: 'start_time',
      width: 180,
      render: (t: string) => new Date(t).toLocaleString(),
    },
    {
      title: 'Stop',
      dataIndex: 'stop_time',
      width: 180,
      render: (t: string | null) => (t ? new Date(t).toLocaleString() : '—'),
    },
    {
      title: 'Duration',
      dataIndex: 'reported_duration_seconds',
      width: 110,
      align: 'right',
      render: (s: number | null) => formatDuration(s ?? 0),
    },
  ]

  const teamTotalSeconds = useMemo(
    () => (activity?.members ?? []).reduce((a, m) => a + m.reported_seconds, 0),
    [activity]
  )

  const datePickerValue = useMemo(() => dayjs(dateYmd, 'YYYY-MM-DD'), [dateYmd])

  const disabledActivityDate = useCallback((current: Dayjs) => {
    if (!current?.isValid()) return true
    const ymd = current.format('YYYY-MM-DD')
    return !isValidMyTeamsActivityDateYmd(ymd)
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div style={{ marginBottom: 20 }}>
            <Title level={2} className="settings-section-heading" style={{ margin: 0, fontSize: '1.5rem' }}>
              <TeamOutlined style={{ marginRight: 10 }} />
              My Teams
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Reported work time for teams you belong to. Pick any calendar day in your local time (up to two years
              back). Click a member to see their tickets and hourly breakdown.
            </Text>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Space wrap align="center" size="middle">
              <Text type="secondary">Day (local)</Text>
              <DatePicker
                value={datePickerValue}
                onChange={(d) => {
                  if (!d?.isValid()) return
                  const next = d.format('YYYY-MM-DD')
                  if (isValidMyTeamsActivityDateYmd(next)) setDateYmd(next)
                }}
                allowClear={false}
                disabledDate={disabledActivityDate}
                format="YYYY-MM-DD"
              />
              <Space size={4} wrap>
                <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => setDateYmd(today)}>
                  Today
                </Button>
                <Text type="secondary">·</Text>
                <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => setDateYmd(yesterday)}>
                  Yesterday
                </Button>
              </Space>
            </Space>
          </div>

          <Spin spinning={teamsLoading}>
            {teams.length === 0 && !teamsLoading ? (
              <Empty description="You are not a member of any team yet." />
            ) : (
              <Row gutter={[20, 20]}>
                <Col xs={24} md={7} lg={6}>
                  <Card title="Teams" size="small">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {teams.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedTeamId(t.id)
                            setDrawerOpen(false)
                            setFocusMember(null)
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            border:
                              selectedTeamId === t.id
                                ? '1px solid var(--ant-color-primary, #1677ff)'
                                : '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                            background: selectedTeamId === t.id ? 'var(--ant-color-primary-bg, #e6f4ff)' : undefined,
                          }}
                        >
                          <Text strong>{t.name}</Text>
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {t.member_count} members
                              {t.type ? ` · ${t.type}` : ''}
                            </Text>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </Col>
                <Col xs={24} md={17} lg={18}>
                  {!selectedTeamId ? (
                    <Empty description="Select a team" />
                  ) : (
                    <Spin spinning={activityLoading}>
                      <Card size="small" style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                          <div>
                            <Text type="secondary">Team total (reported)</Text>
                            <Title level={4} style={{ margin: '4px 0 0' }}>
                              {formatDuration(teamTotalSeconds)}
                            </Title>
                          </div>
                        </div>
                      </Card>

                      <Card title="Daily activity" size="small" style={{ marginBottom: 16 }}>
                        {hourlyChartData.some((d) => d.seconds > 0) ? (
                          <div style={{ width: '100%', height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={hourlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="customer-time-report-chart-grid" />
                                <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                                <YAxis
                                  tick={{ fontSize: 11 }}
                                  tickFormatter={(v) => (v >= 3600 ? `${Math.round(v / 3600)}h` : `${Math.round(v / 60)}m`)}
                                />
                                <Tooltip
                                  formatter={(value) => [formatDuration(Number(value ?? 0)), 'Time']}
                                  labelFormatter={(l) => `Hour ${l}`}
                                />
                                <Bar dataKey="seconds" fill="#9155FD" radius={[4, 4, 0, 0]} name="Seconds" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tracked time this day" />
                        )}
                      </Card>

                      <Card title="Members" size="small">
                        <Table<MemberRow>
                          rowKey="user_id"
                          columns={memberColumns}
                          dataSource={activity?.members ?? []}
                          pagination={false}
                          size="small"
                          showHeader={false}
                          locale={{ emptyText: 'No members' }}
                          onRow={(record) => ({
                            onClick: () => {
                              setFocusMember(record)
                              setDrawerOpen(true)
                            },
                            style: { cursor: 'pointer' },
                          })}
                        />
                      </Card>
                    </Spin>
                  )}
                </Col>
              </Row>
            )}
          </Spin>

          <Drawer
            title={
              focusMember ? (
                <span>
                  {focusMember.user_name}
                  <Text type="secondary" style={{ marginLeft: 8, fontWeight: 400, fontSize: 14 }}>
                    · {dateYmd} (local)
                  </Text>
                </span>
              ) : (
                'Member'
              )
            }
            placement="right"
            width={720}
            open={drawerOpen}
            onClose={() => {
              setDrawerOpen(false)
              setFocusMember(null)
              setDetailActivity(null)
            }}
            destroyOnClose
          >
            <Spin spinning={detailLoading}>
              {focusMember ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <Text type="secondary">Reported time this day</Text>
                    <Title level={4} style={{ margin: '4px 0 0' }}>
                      {formatDuration(
                        detailActivity?.members.find((m) => m.user_id === focusMember.user_id)?.reported_seconds ??
                          focusMember.reported_seconds
                      )}
                    </Title>
                  </div>
                  <Divider style={{ margin: '12px 0' }} />
                  <Title level={5}>Daily activity by hour (local)</Title>
                  {memberHourlyChartData.some((d) => d.seconds > 0) ? (
                    <div style={{ width: '100%', height: 240, marginBottom: 20 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={memberHourlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="customer-time-report-chart-grid" />
                          <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => (v >= 3600 ? `${Math.round(v / 3600)}h` : `${Math.round(v / 60)}m`)}
                          />
                          <Tooltip
                            formatter={(value) => [formatDuration(Number(value ?? 0)), 'Time']}
                            labelFormatter={(l) => `Hour ${l}`}
                          />
                          <Bar dataKey="seconds" fill="#01C4C4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity" style={{ marginBottom: 16 }} />
                  )}
                  <Title level={5}>Sessions & tickets</Title>
                  <Table<SessionRow>
                    rowKey="id"
                    columns={sessionColumns}
                    dataSource={detailActivity?.sessions ?? []}
                    pagination={{ pageSize: 8 }}
                    size="small"
                    locale={{ emptyText: 'No sessions' }}
                  />
                </>
              ) : null}
            </Spin>
          </Drawer>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
