'use client'

import { DeleteOutlined, EyeOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import type { ColumnsType } from 'antd/es/table'

import { canAdminTeams } from '@/lib/auth-utils'

import DateDisplay from '../DateDisplay'

const { Content } = Layout
const { Title, Text } = Typography

/** Maksimal 2 angka di belakang koma */
function formatActiveTicketEquiv(v: number): string {
  if (!Number.isFinite(v)) return '0'
  const rounded = Math.round(v * 100) / 100
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

interface TeamsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface TeamRecord {
  id: string
  name: string
  type: string | null
  created_by: string
  created_at: string
  creator_name?: string
  member_count?: number
  members?: TeamMember[]
}

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

interface CompanyListRow {
  id: string
  name: string | null
  active_team_id: string | null
  active_time: number
}

interface CompanyActivePlanRow {
  key: string
  no: number
  company_label: string
  active_time: number
  active_ticket_equiv: number
}

/** Header tints — cycle for each team block */
const TEAM_PLAN_HEADER_COLORS = ['#e6f4ff', '#fff7e6', '#f9f0ff', '#e6fffb', '#fff1f0', '#f6ffed']

interface TeamPlanGroup {
  teamId: string
  teamName: string
  headerColor: string
  rows: CompanyActivePlanRow[]
}

export default function TeamsContent({ user: currentUser }: TeamsContentProps) {
  const isAdmin = canAdminTeams(currentUser.role)
  const [collapsed, setCollapsed] = useState(false)
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [teamPlanGroups, setTeamPlanGroups] = useState<TeamPlanGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamRecord | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const fetchTeams = async () => {
    setLoading(true)
    try {
      const [teamsWithMembers, companiesRes] = await Promise.all([
        apiFetch<TeamRecord[]>('/api/teams'),
        fetch('/api/companies', { credentials: 'include' }),
      ])
      setTeams(teamsWithMembers)

      const teamNameById = new Map(teamsWithMembers.map((t) => [t.id, t.name]))
      if (companiesRes.ok) {
        const cJson = (await companiesRes.json()) as { data?: CompanyListRow[] }
        const list = Array.isArray(cJson.data) ? cJson.data : []
        const withTeam = list.filter((c) => {
          const tid = c.active_team_id
          return typeof tid === 'string' && tid.trim().length > 0
        })
        const byTeam = new Map<string, CompanyListRow[]>()
        for (const c of withTeam) {
          const tid = c.active_team_id as string
          if (!byTeam.has(tid)) byTeam.set(tid, [])
          byTeam.get(tid)!.push(c)
        }
        const groups: TeamPlanGroup[] = []
        let colorIdx = 0
        for (const [teamId, teamCompanies] of byTeam) {
          const teamName = teamNameById.get(teamId) ?? 'Unknown team'
          teamCompanies.sort((a, b) =>
            String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })
          )
          const rows: CompanyActivePlanRow[] = teamCompanies.map((c, idx) => {
            const cname = (c.name ?? '').trim() || `Company ${c.id.slice(0, 8)}…`
            const at = Number(c.active_time) || 0
            return {
              key: c.id,
              no: idx + 1,
              company_label: cname,
              active_time: at,
              active_ticket_equiv: at / 3,
            }
          })
          groups.push({
            teamId,
            teamName,
            headerColor: TEAM_PLAN_HEADER_COLORS[colorIdx % TEAM_PLAN_HEADER_COLORS.length],
            rows,
          })
          colorIdx += 1
        }
        groups.sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' }))
        setTeamPlanGroups(groups)
      } else {
        setTeamPlanGroups([])
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch teams')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeams()
  }, [])

  const handleCreate = () => {
    setEditingTeam(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: TeamRecord) => {
    setEditingTeam(record)
    form.setFieldsValue({
      name: record.name,
      type: record.type || '',
    })
    setModalVisible(true)
  }

  const handleDelete = async (teamId: string) => {
    try {
      await apiFetch(`/api/teams/${teamId}`, { method: 'DELETE' })
      message.success('Team deleted successfully')
      fetchTeams()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete team')
    }
  }

  const handleSubmit = async (values: any) => {
    setSubmitting(true)
    try {
      if (editingTeam) {
        await apiFetch(`/api/teams/${editingTeam.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, type: values.type || null }),
        })
        message.success('Team updated successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTeams()
      } else {
        await apiFetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, type: values.type || null }),
        })
        message.success('Team created successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTeams()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save team')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<TeamRecord> = [
    {
      title: 'Team Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: TeamRecord) => (
        <Link href={`/settings/teams/${record.id}`} style={{ fontWeight: 600 }}>
          {name}
        </Link>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string | null) => (type ? <Tag>{type}</Tag> : <span>-</span>),
    },
    {
      title: 'Members',
      key: 'members',
      render: (_, record) => (
        <Space>
          <TeamOutlined />
          <span>{record.member_count || 0} member(s)</span>
        </Space>
      ),
    },
    {
      title: 'Created By',
      key: 'created_by',
      render: (_, record) => <span>{record.creator_name}</span>,
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => <DateDisplay date={date} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="View team detail">
            <Link href={`/settings/teams/${record.id}`}>
              <Button type="default" icon={<EyeOutlined />}> Details</Button> 
            </Link>
          </Tooltip>
          {/* <Tooltip title="Manage Members">
            <Button
              type="primary"
              icon={<UserAddOutlined />}
            
              onClick={() => handleManageMembers(record)}
            >
              Members
            </Button>
          </Tooltip> */}
          {isAdmin && (
            <Popconfirm
              title="Delete Team"
              description="Are you sure you want to delete this team? All members will be removed."
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete">
                <Button type="primary" danger icon={<DeleteOutlined />}>
                  Delete
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const companyPlanColumns: ColumnsType<CompanyActivePlanRow> = [
    {
      title: 'No',
      dataIndex: 'no',
      key: 'no',
      width: 64,
      align: 'center',
    },
    {
      title: 'Company',
      dataIndex: 'company_label',
      key: 'company_label',
      ellipsis: true,
    },
    {
      title: 'Time',
      dataIndex: 'active_time',
      key: 'active_time',
      width: 100,
      align: 'center',
      render: (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString(),
    },
    {
      title: 'Active ticket',
      dataIndex: 'active_ticket_equiv',
      key: 'active_ticket_equiv',
      width: 140,
      align: 'center',
      render: (v: number) => formatActiveTicketEquiv(v),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Title level={2} style={{ margin: 0 }}>
                Teams Management
              </Title>
              {isAdmin && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                  Create Team
                </Button>
              )}
            </div>

            <Table
              columns={columns}
              dataSource={teams}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} teams`,
              }}
            />
            <Divider />

            <Title level={4} style={{ marginTop: 40, marginBottom: 8 }}>
            Teams Condition
            </Title>
            
            {teamPlanGroups.length === 0 ? (
              <Text type="secondary">Tidak ada company dengan tim aktif — tidak ada yang ditampilkan di blok ini.</Text>
            ) : (
              <>
                {Array.from({ length: Math.ceil(teamPlanGroups.length / 2) }, (_, rowIdx) => {
                  const slice = teamPlanGroups.slice(rowIdx * 2, rowIdx * 2 + 2)
                  return (
                    <Row key={rowIdx} gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      {slice.map((g) => (
                        <Col xs={24} lg={slice.length === 1 ? 24 : 12} key={g.teamId}>
                          <div
                            style={{
                              border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                              borderRadius: 8,
                              overflow: 'hidden',
                              background: 'var(--ant-color-bg-container, #fff)',
                            }}
                          >
                            <div
                              style={{
                                background: g.headerColor,
                                padding: '10px 14px',
                                fontWeight: 600,
                                borderBottom: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                              }}
                            >
                              {g.teamName}
                            </div>
                            <Table<CompanyActivePlanRow>
                              columns={companyPlanColumns}
                              dataSource={g.rows}
                              rowKey="key"
                              loading={loading}
                              pagination={false}
                              size="small"
                              scroll={{ x: 480 }}
                              summary={() => {
                                const teamTime = g.rows.reduce(
                                  (s, r) => s + (Number(r.active_time) || 0),
                                  0
                                )
                                const teamTicket = teamTime / 3
                                return (
                                  <Table.Summary fixed>
                                    <Table.Summary.Row>
                                      <Table.Summary.Cell index={0} colSpan={2} align="right">
                                        <Text strong>Total</Text>
                                      </Table.Summary.Cell>
                                      <Table.Summary.Cell index={2} align="center">
                                        <Text strong>{teamTime.toLocaleString()}</Text>
                                      </Table.Summary.Cell>
                                      <Table.Summary.Cell index={3} align="center">
                                        <Text strong>{formatActiveTicketEquiv(teamTicket)}</Text>
                                      </Table.Summary.Cell>
                                    </Table.Summary.Row>
                                  </Table.Summary>
                                )
                              }}
                            />
                          </div>
                        </Col>
                      ))}
                    </Row>
                  )
                })}
              </>
            )}
          </Card>

          {/* Create/Edit Team Modal */}
          <Modal
            title={editingTeam ? 'Edit Team' : 'Create Team'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={600}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="name"
                label="Team Name"
                rules={[{ required: true, message: 'Please enter team name!' }]}
              >
                <Input placeholder="Team Name" />
              </Form.Item>

              <Form.Item name="type" label="Type">
                <Input placeholder="Team Type (optional)" />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={submitting}>
                    {editingTeam ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    onClick={() => {
                      setModalVisible(false)
                      form.resetFields()
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>

        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
