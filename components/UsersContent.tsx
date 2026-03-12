'use client'

import { Layout, Table, Button, Space, Typography, Card, Tag, Avatar, Modal, Form, Input, Select, message, Popconfirm, Tooltip, Upload, Switch, InputNumber } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, UploadOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createUser } from '@/app/actions/users'
import { uploadAvatar } from '@/utils/storage'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { Option } = Select
const { TextArea } = Input

interface UsersContentProps {
  user: User & { role?: string }
}

interface UserRecord {
  id: string
  email: string
  full_name: string | null
  role: string
  status: string
  company_id: string | null
  company?: { id: string; name: string } | null
  avatar_url: string | null
  created_at: string
  last_login_at: string | null
  last_active_at: string | null
  phone: string | null
  department: string | null
  position: string | null
  bio: string | null
  timezone: string | null
  locale: string | null
  permissions: any
  is_email_verified: boolean | null
  metadata: any
}

export default function UsersContent({ user: currentUser }: UsersContentProps) {
  const isCustomer = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'customer'
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()

  const filteredUsers = useMemo(() => {
    if (!searchText.trim()) return users
    const q = searchText.trim().toLowerCase()
    return users.filter(
      (u) =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.company?.name || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.position || '').toLowerCase().includes(q)
    )
  }, [users, searchText])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<any[]>('/api/users')
      setUsers(data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanies = async () => {
    try {
      const data = await apiFetch<{ companies: { id: string; name: string }[] }>('/api/tickets/lookup')
      setCompanies(data?.companies || [])
    } catch {
      setCompanies([])
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchCompanies()
  }, [])

  const handleCreate = () => {
    setEditingUser(null)
    setAvatarUrl(null)
    form.resetFields()
    form.setFieldsValue({
      role: 'user',
      status: 'active',
      timezone: 'UTC',
      locale: 'en',
      is_email_verified: false,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: UserRecord) => {
    setEditingUser(record)
    setAvatarUrl(record.avatar_url)
    form.setFieldsValue({
      email: record.email,
      full_name: record.full_name || '',
      role: record.role,
      status: record.status,
      company_id: record.company_id || undefined,
      phone: record.phone || '',
      department: record.department || '',
      position: record.position || '',
      bio: record.bio || '',
      timezone: record.timezone || 'UTC',
      locale: record.locale || 'en',
      is_email_verified: record.is_email_verified || false,
      permissions: record.permissions ? JSON.stringify(record.permissions, null, 2) : '',
      metadata: record.metadata ? JSON.stringify(record.metadata, null, 2) : '',
    })
    setModalVisible(true)
  }

  const handleAvatarUpload = async (file: File) => {
    if (!editingUser) {
      message.warning('Please create the user first, then you can upload avatar')
      return
    }

    setUploading(true)
    try {
      const result = await uploadAvatar(file, editingUser.id)
      
      if (result.error || !result.url) {
        message.error(result.error || 'Failed to upload avatar. Please check storage bucket permissions.')
        console.error('Upload error details:', result.error)
        return
      }

      setAvatarUrl(result.url)
      message.success('Avatar uploaded successfully!')
    } catch (error: any) {
      message.error(error.message || 'Failed to upload avatar')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (userId: string) => {
    try {
      await apiFetch(`/api/users/${userId}`, { method: 'DELETE' })
      message.success('User deleted successfully')
      fetchUsers()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete user')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      // Parse JSON fields
      let permissions = null
      let metadata = null
      
      if (values.permissions) {
        try {
          permissions = JSON.parse(values.permissions)
        } catch (e) {
          message.error('Invalid JSON format for permissions')
          return
        }
      }
      
      if (values.metadata) {
        try {
          metadata = JSON.parse(values.metadata)
        } catch (e) {
          message.error('Invalid JSON format for metadata')
          return
        }
      }

      if (editingUser) {
        const patchBody: Record<string, unknown> = {
          full_name: values.full_name,
          status: values.status,
          avatar_url: avatarUrl,
          phone: values.phone || null,
          timezone: values.timezone || 'UTC',
          locale: values.locale || 'en',
          is_email_verified: values.is_email_verified || false,
        }
        if (!isCustomer) {
          Object.assign(patchBody, {
            role: values.role,
            company_id: values.company_id || null,
            department: values.department || null,
            position: values.position || null,
            bio: values.bio || null,
            permissions,
            metadata,
          })
        }
        await apiFetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })

        message.success('User updated successfully')
        setModalVisible(false)
        form.resetFields()
        setAvatarUrl(null)
        fetchUsers()
      } else {
        // Create new user using server action
        const result = await createUser({
          email: values.email,
          password: values.password,
          full_name: values.full_name,
          role: isCustomer ? 'user' : values.role,
          status: values.status,
        })

        if (result.error) {
          message.error(result.error)
        } else if (result.data) {
          // Update additional fields after creation
          const updateData: any = {
            phone: values.phone || null,
            timezone: values.timezone || 'UTC',
            locale: values.locale || 'en',
            is_email_verified: values.is_email_verified || false,
          }
          if (!isCustomer) {
            Object.assign(updateData, {
              department: values.department || null,
              position: values.position || null,
              bio: values.bio || null,
              company_id: values.company_id || null,
              permissions: permissions,
              metadata: metadata,
            })
          }
          if (avatarUrl) {
            updateData.avatar_url = avatarUrl
          }

          await apiFetch(`/api/users/${result.data.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
          })

          message.success('User created successfully')
          setModalVisible(false)
          form.resetFields()
          setAvatarUrl(null)
          fetchUsers()
        }
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save user')
    }
  }

  const baseColumns: ColumnsType<UserRecord> = [
    {
      title: 'User',
      key: 'user',
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Space>
          <Avatar icon={<UserOutlined />} src={record.avatar_url} />
          <div>
            <div style={{ fontWeight: 500 }}>{record.full_name || 'N/A'}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      sorter: (a, b) => a.role.localeCompare(b.role),
      sortDirections: ['ascend', 'descend'],
      render: (role: string) => {
        const colorMap: Record<string, string> = {
          admin: 'red',
          manager: 'blue',
          user: 'green',
          customer: 'purple',
          guest: 'default',
        }
        return <Tag color={colorMap[role] || 'default'}>{role.toUpperCase()}</Tag>
      },
    },
    {
      title: 'Company',
      key: 'company',
      width: 140,
      sorter: (a, b) => (a.company?.name || '').localeCompare(b.company?.name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (_, r) => (<>{r.company?.name ?? 'N/A'}</>),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: (a, b) => a.status.localeCompare(b.status),
      sortDirections: ['ascend', 'descend'],
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          active: 'green',
          inactive: 'default',
          suspended: 'red',
          pending: 'orange',
        }
        return <Tag color={colorMap[status] || 'default'}>{status.toUpperCase()}</Tag>
      },
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string | null) => dept || 'N/A',
    },
    {
      title: 'Position',
      dataIndex: 'position',
      key: 'position',
      render: (pos: string | null) => pos || 'N/A',
    },
    {
      title: 'Last Login',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      sorter: (a, b) => {
        const da = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
        const db2 = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
        return da - db2
      },
      sortDirections: ['ascend', 'descend'],
      render: (date: string | null) => date ? <DateDisplay date={date} /> : 'Never',
    },
    {
      title: 'Last Active',
      dataIndex: 'last_active_at',
      key: 'last_active_at',
      render: (date: string | null) => date ? <DateDisplay date={date} /> : 'N/A',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      sortDirections: ['ascend', 'descend'],
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
              size="small"
              onClick={() => router.push(`/users/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete User"
            description="Are you sure you want to delete this user?"
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
        </Space>
      ),
    },
  ]

  const columns = useMemo(
    () =>
      isCustomer
        ? baseColumns.filter(
            (c) => !['role', 'company', 'department', 'position'].includes(String(c.key))
          )
        : baseColumns,
    [isCustomer]
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
              <Title level={2} style={{ margin: 0 }}>Users Management</Title>
              <Space>
                <Input
                  placeholder="Search by name, email, company..."
                  prefix={<SearchOutlined />}
                  allowClear
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ width: 260 }}
                />
                <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                Add User
              </Button>
              </Space>
            </div>

            <Table
              columns={columns}
              dataSource={filteredUsers}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} users`,
              }}
            />
          </Card>

          <Modal
            title={editingUser ? 'Edit User' : 'Create User'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
              setAvatarUrl(null)
            }}
            footer={null}
            width={800}
            style={{ top: 20 }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
            >
              {editingUser && (
                <Form.Item label="Avatar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Avatar
                      size={64}
                      icon={<UserOutlined />}
                      src={avatarUrl || editingUser.avatar_url}
                    />
                    <Upload
                      beforeUpload={(file) => {
                        const isImage = file.type.startsWith('image/')
                        if (!isImage) {
                          message.error('You can only upload image files!')
                          return false
                        }
                        const isLt2M = file.size / 1024 / 1024 < 2
                        if (!isLt2M) {
                          message.error('Image must be smaller than 2MB!')
                          return false
                        }
                        handleAvatarUpload(file)
                        return false
                      }}
                      showUploadList={false}
                      accept="image/*"
                    >
                      <Button
                        icon={<UploadOutlined />}
                        loading={uploading}
                        disabled={uploading}
                      >
                        {uploading ? 'Uploading...' : 'Upload Avatar'}
                      </Button>
                    </Upload>
                  </div>
                </Form.Item>
              )}

              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Please enter email!' },
                  { type: 'email', message: 'Invalid email!' }
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="Email"
                  disabled={!!editingUser}
                />
              </Form.Item>

              {!editingUser && (
                <Form.Item
                  name="password"
                  label="Password"
                  rules={[
                    { required: true, message: 'Please enter password!' },
                    { min: 6, message: 'Password must be at least 6 characters!' }
                  ]}
                >
                  <Input.Password placeholder="Password" />
                </Form.Item>
              )}

              <Form.Item
                name="full_name"
                label="Full Name"
                rules={[{ required: true, message: 'Please enter full name!' }]}
              >
                <Input placeholder="Full Name" />
              </Form.Item>

              {!isCustomer && (
                <Form.Item
                  name="role"
                  label="Role"
                  rules={[{ required: true, message: 'Please select role!' }]}
                >
                  <Select placeholder="Select Role">
                    <Option value="admin">Admin</Option>
                    <Option value="manager">Manager</Option>
                    <Option value="user">User</Option>
                    <Option value="customer">Customer</Option>
                    <Option value="guest">Guest</Option>
                  </Select>
                </Form.Item>
              )}

              <Form.Item
                name="status"
                label="Status"
                rules={[{ required: true, message: 'Please select status!' }]}
              >
                <Select placeholder="Select Status">
                  <Option value="active">Active</Option>
                  <Option value="inactive">Inactive</Option>
                  <Option value="suspended">Suspended</Option>
                  <Option value="pending">Pending</Option>
                </Select>
              </Form.Item>

              {!isCustomer && (
                <Form.Item name="company_id" label="Company">
                  <Select placeholder="Select Company (optional)" allowClear>
                    {companies.map((c) => (
                      <Option key={c.id} value={c.id}>{c.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
              )}

              <Form.Item
                name="phone"
                label="Phone"
              >
                <Input placeholder="Phone Number" />
              </Form.Item>

              {!isCustomer && (
                <>
                  <Form.Item
                    name="department"
                    label="Department"
                  >
                    <Input placeholder="Department" />
                  </Form.Item>
                  <Form.Item
                    name="position"
                    label="Position"
                  >
                    <Input placeholder="Position/Job Title" />
                  </Form.Item>
                  <Form.Item
                    name="bio"
                    label="Bio"
                  >
                    <TextArea rows={3} placeholder="Bio/Description" />
                  </Form.Item>
                </>
              )}

              <Form.Item
                name="timezone"
                label="Timezone"
              >
                <Select placeholder="Select Timezone" showSearch>
                  <Option value="UTC">UTC</Option>
                  <Option value="America/New_York">America/New_York (EST)</Option>
                  <Option value="America/Chicago">America/Chicago (CST)</Option>
                  <Option value="America/Denver">America/Denver (MST)</Option>
                  <Option value="America/Los_Angeles">America/Los_Angeles (PST)</Option>
                  <Option value="Europe/London">Europe/London (GMT)</Option>
                  <Option value="Europe/Paris">Europe/Paris (CET)</Option>
                  <Option value="Asia/Tokyo">Asia/Tokyo (JST)</Option>
                  <Option value="Asia/Shanghai">Asia/Shanghai (CST)</Option>
                  <Option value="Asia/Jakarta">Asia/Jakarta (WIB)</Option>
                  <Option value="Asia/Singapore">Asia/Singapore (SGT)</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="locale"
                label="Locale"
              >
                <Select placeholder="Select Locale">
                  <Option value="en">English (en)</Option>
                  <Option value="id">Indonesian (id)</Option>
                  <Option value="es">Spanish (es)</Option>
                  <Option value="fr">French (fr)</Option>
                  <Option value="de">German (de)</Option>
                  <Option value="ja">Japanese (ja)</Option>
                  <Option value="zh">Chinese (zh)</Option>
                </Select>
              </Form.Item>

              {editingUser && (
                <Form.Item
                  name="is_email_verified"
                  label="Email Verified"
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              )}

              {!isCustomer && (
                <>
                  <Form.Item
                    name="permissions"
                    label="Permissions (JSON)"
                    tooltip="Enter permissions as JSON object, e.g. {'read': true, 'write': false}"
                  >
                    <TextArea rows={4} placeholder='{"read": true, "write": false}' />
                  </Form.Item>
                  <Form.Item
                    name="metadata"
                    label="Metadata (JSON)"
                    tooltip="Enter additional metadata as JSON object"
                  >
                    <TextArea rows={4} placeholder='{"key": "value"}' />
                  </Form.Item>
                </>
              )}

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingUser ? 'Update' : 'Create'}
                  </Button>
                  <Button onClick={() => {
                    setModalVisible(false)
                    form.resetFields()
                  }}>
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </Layout>
    </Layout>
  )
}

