'use client'

import { Layout, Table, Button, Space, Typography, Card, Tag, Avatar, Modal, Form, Input, Select, message, Popconfirm, Tooltip, Upload, Switch, InputNumber, Col, Row } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, UploadOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createUser } from '@/app/actions/users'
import { uploadAvatar } from '@/utils/storage'
import { USER_DEPARTMENTS, USER_POSITIONS } from '@/lib/user-work-dropdowns'

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
import { SpaNavLink, shouldOpenHrefInNewTab } from './SpaNavLink'
import { confirmUserCompanyMove } from '@/components/confirm-user-company-move'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { Option } = Select
const { TextArea } = Input

interface UsersContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
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
  is_email_verified: boolean | null
}

export default function UsersContent({ user: currentUser }: UsersContentProps) {
  const router = useRouter()
  const isCustomer = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'customer'
  const isAdmin = ((currentUser as { role?: string }).role ?? '').toLowerCase() === 'admin'
  const [collapsed, setCollapsed] = useState(false)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterRole, setFilterRole] = useState<string | undefined>(undefined)
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const selectedRole = Form.useWatch('role', form)

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase()
        const matchesSearch =
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.company?.name || '').toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q) ||
          (u.position || '').toLowerCase().includes(q)
        if (!matchesSearch) return false
      }
      if (filterRole && u.role !== filterRole) return false
      if (filterStatus && u.status !== filterStatus) return false
      return true
    })
  }, [users, searchText, filterRole, filterStatus])

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
      role: 'staff',
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

  const runUserModalSave = async (values: any) => {
    try {
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
          })
        }
        if (isAdmin && values.newPassword?.trim()) {
          patchBody.password = values.newPassword
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

  const handleSubmit = async (values: any) => {
    if (editingUser && !isCustomer && values.role === 'customer') {
      const newCo = (values.company_id || null) as string | null
      const oldCo = editingUser.company_id || null
      if (newCo && oldCo && newCo !== oldCo) {
        const userLabel = editingUser.full_name || editingUser.email || 'User'
        confirmUserCompanyMove({
          userLabel,
          fromCompanyName: editingUser.company?.name || 'company lain',
          toCompanyName: companies.find((c) => c.id === newCo)?.name || 'company lain',
          onOk: () => runUserModalSave(values),
        })
        return
      }
    }
    await runUserModalSave(values)
  }
  const baseColumns: ColumnsType<UserRecord> = [
    {
      title: 'User',
      key: 'user',
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Space align="start">
          <Avatar icon={<UserOutlined />} src={record.avatar_url} />
          <SpaNavLink
            href={`/users/${record.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{record.full_name || 'N/A'}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{record.email}</div>
            </div>
          </SpaNavLink>
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
              href={`/users/${record.id}`}
              aria-label="View user details"
              onClick={(e) => {
                if (shouldOpenHrefInNewTab(e)) return
                if (e.button !== 0) return
                e.preventDefault()
                router.push(`/users/${record.id}`)
              }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="primary"
              icon={<EditOutlined />}

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
              <Space wrap>
                <Input
                  placeholder="Search by name, email, company..."
                  prefix={<SearchOutlined />}
                  allowClear
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                    setPagination((p) => ({ ...p, current: 1 }))
                  }}
                  style={{ width: 260 }}
                />
                {!isCustomer && (
                  <Select
                    placeholder="Filter by Role"
                    allowClear
                    value={filterRole}
                    onChange={(v) => {
                      setFilterRole(v)
                      setPagination((p) => ({ ...p, current: 1 }))
                    }}
                    style={{ width: 140 }}
                  >
                    <Option value="admin">Admin</Option>
                    <Option value="manager">Manager</Option>
                    <Option value="user">User</Option>
                    <Option value="customer">Customer</Option>
                    <Option value="guest">Guest</Option>
                  </Select>
                )}
                <Select
                  placeholder="Filter by Status"
                  allowClear
                  value={filterStatus}
                  onChange={(v) => {
                    setFilterStatus(v)
                    setPagination((p) => ({ ...p, current: 1 }))
                  }}
                  style={{ width: 150 }}
                >
                  <Option value="active">Active</Option>
                  <Option value="inactive">Inactive</Option>
                  <Option value="suspended">Suspended</Option>
                  <Option value="pending">Pending</Option>
                </Select>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleCreate}
                >
                  Add User
                </Button>
              </Space>
            </div>

            <div
              style={{
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <Table<UserRecord>
                columns={columns}
                dataSource={filteredUsers}
                rowKey="id"
                loading={loading}
                scroll={{ x: 'max-content' }}
                tableLayout="auto"
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '15', '20', '50'],
                  showTotal: (total) => `Total ${total} users`,
                  onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                  responsive: true,
                }}
              />
            </div>
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

              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    name="full_name"
                    label="Full Name"
                    rules={[{ required: true, message: 'Please enter full name!' }]}
                  >
                    <Input placeholder="Full Name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
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
                </Col>
              </Row>

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

              {editingUser && isAdmin && (
                <>
                  <Form.Item
                    name="newPassword"
                    label="New Password (optional)"
                    rules={[
                      { min: 6, message: 'Password must be at least 6 characters!' },
                    ]}
                  >
                    <Input.Password placeholder="Leave blank to keep current password" />
                  </Form.Item>
                  <Form.Item
                    name="confirmPassword"
                    label="Confirm New Password"
                    dependencies={['newPassword']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const pwd = getFieldValue('newPassword')
                          if (!pwd) return Promise.resolve()
                          if (!value || pwd === value) return Promise.resolve()
                          return Promise.reject(new Error('Passwords do not match!'))
                        },
                      }),
                    ]}
                  >
                    <Input.Password placeholder="Confirm new password" />
                  </Form.Item>
                </>
              )}



              {!isCustomer && (
                <>
                  <Row gutter={24}>
                    <Col span={12}>
                      <Form.Item
                        name="role"
                        label="Role"
                        rules={[{ required: true, message: 'Please select role!' }]}
                      >
                        <Select placeholder="Select Role">
                          <Option value="admin">Admin</Option>
                          <Option value="manager">Manager</Option>
                          <Option value="staff">Staff</Option>
                          <Option value="customer">Customer</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>

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
                    </Col>
                  </Row>
                  {(selectedRole === 'customer') && (
                    <Form.Item name="company_id" label="Company">
                      <Select placeholder="Select Company (optional)" allowClear>
                        {companies.map((c) => (
                          <Option key={c.id} value={c.id}>{c.name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )}
                  {(selectedRole !== 'customer') && (
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item
                          name="department"
                          label="Department"
                        >
                          <Select placeholder="Select Department" allowClear>
                            {USER_DEPARTMENTS.map((d) => (
                              <Option key={d} value={d}>
                                {d}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="position"
                          label="Position"
                        >
                          <Select placeholder="Select Position" allowClear>
                            {USER_POSITIONS.map((p) => (
                              <Option key={p} value={p}>
                                {p}
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item
                          name="bio"
                          label="Bio"
                        >
                          <TextArea rows={3} placeholder="Bio/Description" />
                        </Form.Item>
                      </Col>
                    </Row>

                  )}
                </>
              )}




              <Row gutter={24}>
                <Col span={12}>
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
                </Col>
                <Col span={12}>
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
                </Col>
              </Row>

              {editingUser && (
                <Form.Item
                  name="is_email_verified"
                  label="Email Verified"
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
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

