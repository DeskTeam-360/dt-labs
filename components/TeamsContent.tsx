'use client'

import {
  Layout,
  Table,
  Button,
  Space,
  Typography,
  Card,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Tooltip,
} from 'antd'
import { PlusOutlined, DeleteOutlined, TeamOutlined, EyeOutlined } from '@ant-design/icons'
import { useState, useEffect, useMemo, type Key } from 'react'
import { useRouter } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import DateDisplay from './DateDisplay'
import { SpaNavLink, shouldOpenHrefInNewTab } from './SpaNavLink'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography

interface TeamsContentProps {
  user: { id: string; email?: string | null; name?: string | null }
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

export default function TeamsContent({ user: currentUser }: TeamsContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamRecord | null>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [bulkAction, setBulkAction] = useState<'delete' | null>(null)

  const bulkDeletableCount = useMemo(
    () =>
      selectedRowKeys.filter((k) => {
        const team = teams.find((t) => t.id === String(k))
        return team && team.created_by === currentUser.id
      }).length,
    [selectedRowKeys, teams, currentUser.id]
  )

  const fetchTeams = async () => {
    setLoading(true)
    try {
      const teamsWithMembers = await apiFetch<TeamRecord[]>('/api/teams')
      setTeams(teamsWithMembers)
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch teams')
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

  // Row edit button is commented out; keep for when it returns.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
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
      setSelectedRowKeys((keys) => keys.filter((k) => String(k) !== teamId))
      fetchTeams()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete team')
    }
  }

  const handleBulkDelete = async () => {
    const deletableIds = selectedRowKeys
      .map(String)
      .filter((id) => {
        const team = teams.find((t) => t.id === id)
        return team && team.created_by === currentUser.id
      })
    if (deletableIds.length === 0) {
      message.warning(
        'You can only delete teams you created. Select teams you own, or delete them one by one from the row actions.'
      )
      return
    }
    setBulkAction('delete')
    try {
      const results = await Promise.allSettled(
        deletableIds.map((id) => apiFetch(`/api/teams/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      if (ok > 0) message.success(`Deleted ${ok} team(s)`)
      if (failed > 0) message.error(`${failed} delete(s) failed`)
      setSelectedRowKeys([])
      fetchTeams()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Bulk delete failed')
    } finally {
      setBulkAction(null)
    }
  }

  const handleSubmit = async (values: { name: string; type?: string }) => {
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
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save team')
    }
  }

  const columns: ColumnsType<TeamRecord> = [
    {
      title: 'Team',
      key: 'team',
      render: (_, record) => (
        <SpaNavLink
          href={`/teams/${record.id}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.type || '—'}</div>
          </div>
        </SpaNavLink>
      ),
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
      render: (date: string) => <DateDisplay date={date} format="date-only" />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="default"
              icon={<EyeOutlined />}
              href={`/teams/${record.id}`}
              aria-label="View team details"
              onClick={(e) => {
                if (shouldOpenHrefInNewTab(e)) return
                if (e.button !== 0) return
                e.preventDefault()
                router.push(`/teams/${record.id}`)
              }}
            />
          </Tooltip>
          {record.created_by === currentUser.id && (
            <Popconfirm
              title="Delete Team"
              description="Are you sure you want to delete this team? All members will be removed."
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete">
                <Button type="primary" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <Title level={2} style={{ margin: 0 }}>
                Teams Management
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Create Team
              </Button>
            </div>

            {selectedRowKeys.length > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  background: '#e6f4ff',
                  border: '1px solid #91caff',
                  borderRadius: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Typography.Text strong>{selectedRowKeys.length} selected</Typography.Text>
                <Space wrap>
                  <Popconfirm
                    title="Delete selected teams?"
                    description={
                      bulkDeletableCount > 0
                        ? `This will permanently delete ${bulkDeletableCount} team(s) you created. Other selected teams will be skipped.`
                        : 'You can only delete teams you created. Select teams you own.'
                    }
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                    onConfirm={handleBulkDelete}
                    disabled={bulkAction !== null || bulkDeletableCount === 0}
                  >
                    <span>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        loading={bulkAction === 'delete'}
                        disabled={
                          bulkDeletableCount === 0 ||
                          (bulkAction !== null && bulkAction !== 'delete')
                        }
                      >
                        Bulk delete
                      </Button>
                    </span>
                  </Popconfirm>
                  <Button
                    type="link"
                    onClick={() => setSelectedRowKeys([])}
                    disabled={bulkAction !== null}
                  >
                    Clear selection
                  </Button>
                </Space>
              </div>
            )}

            <div
              style={{
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <Table<TeamRecord>
                columns={columns}
                dataSource={teams}
                rowKey="id"
                loading={loading}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                scroll={{ x: 'max-content' }}
                tableLayout="auto"
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '15', '20', '50'],
                  showTotal: (total) => `Total ${total} teams`,
                  onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                  responsive: true,
                }}
              />
            </div>
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
                  <Button type="primary" htmlType="submit">
                    {editingTeam ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    onClick={() => {
                      setModalVisible(false)
                      form.resetFields()
                    }}
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
