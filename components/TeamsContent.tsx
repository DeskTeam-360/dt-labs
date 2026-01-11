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
  Select,
  message,
  Popconfirm,
  Tooltip,
  Avatar,
  Divider,
  List,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { Option } = Select

interface TeamsContentProps {
  user: User
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
}

interface UserRecord {
  id: string
  full_name: string | null
  email: string
}

export default function TeamsContent({ user: currentUser }: TeamsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [membersModalVisible, setMembersModalVisible] = useState(false)
  const [editingTeam, setEditingTeam] = useState<TeamRecord | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<TeamRecord | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [allUsers, setAllUsers] = useState<UserRecord[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [form] = Form.useForm()
  const [membersForm] = Form.useForm()
  const supabase = createClient()

  const fetchTeams = async () => {
    setLoading(true)
    try {
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select(`
          *,
          creator:users!teams_created_by_fkey(id, full_name, email)
        `)
        .order('created_at', { ascending: false })

      if (teamsError) throw teamsError

      // Fetch member count and members for each team
      const teamsWithMembers = await Promise.all(
        (teamsData || []).map(async (team: any) => {
          const { data: membersData } = await supabase
            .from('team_members')
            .select(`
              *,
              user:users!team_members_user_id_fkey(id, full_name, email)
            `)
            .eq('team_id', team.id)

          const members = (membersData || []).map((member: any) => ({
            id: member.id,
            team_id: member.team_id,
            user_id: member.user_id,
            role: member.role,
            joined_at: member.joined_at,
            user_name: member.user?.full_name || member.user?.email || 'Unknown',
            user_email: member.user?.email || '',
          }))

          return {
            ...team,
            creator_name: team.creator?.full_name || team.creator?.email || 'Unknown',
            member_count: members.length,
            members,
          }
        })
      )

      setTeams(teamsWithMembers as TeamRecord[])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch teams')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .order('full_name', { ascending: true })

      if (error) throw error
      setAllUsers(data || [])
    } catch (error: any) {
      console.error('Failed to fetch users:', error)
    }
  }

  useEffect(() => {
    fetchTeams()
    fetchAllUsers()
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
      // Delete team members first
      const { error: membersError } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)

      if (membersError) throw membersError

      // Delete team
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId)

      if (error) throw error

      message.success('Team deleted successfully')
      fetchTeams()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete team')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingTeam) {
        // Update existing team
        const { error } = await supabase
          .from('teams')
          .update({
            name: values.name,
            type: values.type || null,
          })
          .eq('id', editingTeam.id)

        if (error) throw error

        message.success('Team updated successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTeams()
      } else {
        // Create new team
        const { error } = await supabase
          .from('teams')
          .insert({
            name: values.name,
            type: values.type || null,
            created_by: currentUser.id,
          })

        if (error) throw error

        message.success('Team created successfully')
        setModalVisible(false)
        form.resetFields()
        fetchTeams()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save team')
    }
  }

  const handleManageMembers = (team: TeamRecord) => {
    setSelectedTeam(team)
    setTeamMembers(team.members || [])
    setSelectedUsers([])
    membersForm.resetFields()
    setMembersModalVisible(true)
  }

  const handleAddMembers = async () => {
    if (!selectedTeam || selectedUsers.length === 0) {
      message.warning('Please select at least one user')
      return
    }

    try {
      // Get existing member user_ids to avoid duplicates
      const existingUserIds = teamMembers.map((m) => m.user_id)

      // Filter out users that are already members
      const newUserIds = selectedUsers.filter((userId) => !existingUserIds.includes(userId))

      if (newUserIds.length === 0) {
        message.warning('Selected users are already members of this team')
        return
      }

      // Insert new members
      const membersToInsert = newUserIds.map((userId) => ({
        team_id: selectedTeam.id,
        user_id: userId,
        role: 'member',
      }))

      const { error } = await supabase
        .from('team_members')
        .insert(membersToInsert)

      if (error) throw error

      message.success(`${newUserIds.length} member(s) added successfully`)
      setSelectedUsers([])
      fetchTeams()
      // Refresh members list in modal
      const { data: membersData } = await supabase
        .from('team_members')
        .select(`
          *,
          user:users!team_members_user_id_fkey(id, full_name, email)
        `)
        .eq('team_id', selectedTeam.id)

      if (membersData) {
        const members = membersData.map((member: any) => ({
          id: member.id,
          team_id: member.team_id,
          user_id: member.user_id,
          role: member.role,
          joined_at: member.joined_at,
          user_name: member.user?.full_name || member.user?.email || 'Unknown',
          user_email: member.user?.email || '',
        }))
        setTeamMembers(members)
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to add members')
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error

      message.success(`Member ${memberName} removed successfully`)
      fetchTeams()

      // Refresh members list in modal
      if (selectedTeam) {
        const { data: membersData } = await supabase
          .from('team_members')
          .select(`
            *,
            user:users!team_members_user_id_fkey(id, full_name, email)
          `)
          .eq('team_id', selectedTeam.id)

        if (membersData) {
          const members = membersData.map((member: any) => ({
            id: member.id,
            team_id: member.team_id,
            user_id: member.user_id,
            role: member.role,
            joined_at: member.joined_at,
            user_name: member.user?.full_name || member.user?.email || 'Unknown',
            user_email: member.user?.email || '',
          }))
          setTeamMembers(members)
        }
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to remove member')
    }
  }

  const columns: ColumnsType<TeamRecord> = [
    {
      title: 'Team Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
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
          <Tooltip title="Manage Members">
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              size="small"
              onClick={() => handleManageMembers(record)}
            >
              Members
            </Button>
          </Tooltip>
          {record.created_by === currentUser.id && (
            <>
              <Tooltip title="Edit">
                <Button
                  type="default"
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => handleEdit(record)}
                />
              </Tooltip>
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
                    size="small"
                  />
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

      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
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

          {/* Manage Members Modal */}
          <Modal
            title={`Manage Members - ${selectedTeam?.name || ''}`}
            open={membersModalVisible}
            onCancel={() => {
              setMembersModalVisible(false)
              setSelectedTeam(null)
              setTeamMembers([])
              setSelectedUsers([])
              membersForm.resetFields()
            }}
            footer={null}
            width={700}
          >
            <Form form={membersForm} layout="vertical">
              <Form.Item label="Add Members">
                <Select
                  mode="multiple"
                  placeholder="Select users to add to team"
                  value={selectedUsers}
                  onChange={setSelectedUsers}
                  optionLabelProp="label"
                  style={{ width: '100%' }}
                >
                  {allUsers
                    .filter((user) => !teamMembers.some((m) => m.user_id === user.id))
                    .map((user) => (
                      <Option key={user.id} value={user.id} label={user.full_name || user.email}>
                        {user.full_name || user.email}
                      </Option>
                    ))}
                </Select>
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  icon={<UserAddOutlined />}
                  onClick={handleAddMembers}
                  disabled={selectedUsers.length === 0}
                >
                  Add Selected Members
                </Button>
              </Form.Item>
            </Form>

            <Divider>Team Members ({teamMembers.length})</Divider>

            {teamMembers.length === 0 ? (
              <Empty description="No members in this team" />
            ) : (
              <List
                dataSource={teamMembers}
                renderItem={(member) => (
                  <List.Item
                    actions={[
                      <Popconfirm
                        key="remove"
                        title="Remove Member"
                        description={`Remove ${member.user_name} from this team?`}
                        onConfirm={() => handleRemoveMember(member.id, member.user_name || '')}
                        okText="Yes"
                        cancelText="No"
                      >
                        <Button
                          type="text"
                          danger
                          icon={<UserDeleteOutlined />}
                          size="small"
                        >
                          Remove
                        </Button>
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Avatar icon={<UserOutlined />} />}
                      title={
                        <Space>
                          {member.user_name}
                          <Tag color={member.role === 'manager' ? 'blue' : 'default'}>
                            {member.role}
                          </Tag>
                        </Space>
                      }
                      description={member.user_email}
                    />
                  </List.Item>
                )}
              />
            )}
          </Modal>
        </Content>
      </Layout>
    </Layout>
  )
}
