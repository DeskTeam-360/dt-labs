'use client'

import {
  Layout,
  Table,
  Button,
  Space,
  Typography,
  Card,
  Tag,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Tooltip,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, EyeOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import Link from 'next/link'
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
  const [collapsed, setCollapsed] = useState(false)
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamRecord | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const fetchTeams = async () => {
    setLoading(true)
    try {
      const teamsWithMembers = await apiFetch<TeamRecord[]>('/api/teams')
      setTeams(teamsWithMembers)
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
          {record.created_by === currentUser.id && (
            <>
              {/* <Tooltip title="Edit">
                <Button
                  type="default"
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => handleEdit(record)}
                />
              </Tooltip> */}
              <Popconfirm
                title="Delete Team"
                description="Are you sure you want to delete this team? All members will be removed."
                onConfirm={() => handleDelete(record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Tooltip title="Delete">
                  <Button
                    type="primary"
                    danger
                    icon={<DeleteOutlined />}
                  > Delete</Button>
                </Tooltip>
              </Popconfirm>
            </>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Title level={2} style={{ margin: 0 }}>
                Teams Management
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Create Team
              </Button>
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
