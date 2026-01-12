'use client'

import { Layout, Card, Descriptions, Avatar, Tag, Typography, Button, Space, Row, Col, Divider, Form, Input, Select, Switch, Modal, message, Upload, Tabs, Table, DatePicker, Radio, Statistic } from 'antd'
import { ArrowLeftOutlined, UserOutlined, MailOutlined, PhoneOutlined, BankOutlined, IdcardOutlined, GlobalOutlined, TranslationOutlined, CalendarOutlined, ClockCircleOutlined, EditOutlined, SaveOutlined, CloseOutlined, UploadOutlined, SafetyOutlined, DatabaseOutlined, HistoryOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { uploadAvatar } from '@/utils/storage'
import AdminSidebar from './AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input
const { RangePicker } = DatePicker

interface UserDetailContentProps {
  user: User
  userData: any
}

export default function UserDetailContent({ user: currentUser, userData: initialUserData }: UserDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [userData, setUserData] = useState(initialUserData)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(userData.avatar_url)
  const [form] = Form.useForm()
  const [timeTrackerData, setTimeTrackerData] = useState<any[]>([])
  const [allTimeTrackerData, setAllTimeTrackerData] = useState<any[]>([])
  const [timeTrackerLoading, setTimeTrackerLoading] = useState(false)
  const [filterPeriod, setFilterPeriod] = useState<string>('all')
  const [customDateRange, setCustomDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [overviewData, setOverviewData] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
  })
  const supabase = createClient()

  useEffect(() => {
    setUserData(initialUserData)
    setAvatarUrl(initialUserData.avatar_url)
  }, [initialUserData])

  const fetchTimeTrackerData = useCallback(async (filter?: string, dateRange?: [Dayjs | null, Dayjs | null] | null) => {
    if (!userData?.id) return
    
    setTimeTrackerLoading(true)
    try {
      let query = supabase
        .from('todo_time_tracker')
        .select(`
          *,
          todo:todos!todo_time_tracker_todo_id_fkey(id, title, description)
        `)
        .eq('user_id', userData.id)

      // Apply date filter
      if (filter === 'week') {
        const weekAgo = dayjs().subtract(7, 'day').startOf('day').toISOString()
        query = query.gte('start_time', weekAgo)
      } else if (filter === 'month') {
        const monthAgo = dayjs().subtract(30, 'day').startOf('day').toISOString()
        query = query.gte('start_time', monthAgo)
      } else if (filter === 'custom' && dateRange && dateRange[0] && dateRange[1]) {
        const startDate = dateRange[0].startOf('day').toISOString()
        const endDate = dateRange[1].endOf('day').toISOString()
        query = query.gte('start_time', startDate).lte('start_time', endDate)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error

      setTimeTrackerData(data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch time tracker data')
    } finally {
      setTimeTrackerLoading(false)
    }
  }, [userData?.id, supabase])

  const fetchAllTimeTrackerData = useCallback(async () => {
    if (!userData?.id) return
    
    try {
      const { data, error } = await supabase
        .from('todo_time_tracker')
        .select(`
          *,
          todo:todos!todo_time_tracker_todo_id_fkey(id, title, description)
        `)
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      setAllTimeTrackerData(data || [])
      
      // Calculate overview
      const now = dayjs()
      const todayStart = now.startOf('day')
      const weekStart = now.startOf('week')
      const monthStart = now.startOf('month')

      const todayTotal = (data || [])
        .filter((item: any) => {
          const startTime = dayjs(item.start_time)
          return (startTime.isAfter(todayStart) || startTime.isSame(todayStart)) && item.duration_seconds
        })
        .reduce((sum: number, item: any) => sum + (item.duration_seconds || 0), 0)

      const weekTotal = (data || [])
        .filter((item: any) => {
          const startTime = dayjs(item.start_time)
          return (startTime.isAfter(weekStart) || startTime.isSame(weekStart)) && item.duration_seconds
        })
        .reduce((sum: number, item: any) => sum + (item.duration_seconds || 0), 0)

      const monthTotal = (data || [])
        .filter((item: any) => {
          const startTime = dayjs(item.start_time)
          return (startTime.isAfter(monthStart) || startTime.isSame(monthStart)) && item.duration_seconds
        })
        .reduce((sum: number, item: any) => sum + (item.duration_seconds || 0), 0)

      setOverviewData({
        today: todayTotal,
        thisWeek: weekTotal,
        thisMonth: monthTotal,
      })
    } catch (error: any) {
      console.error('Failed to fetch all time tracker data:', error)
    }
  }, [userData?.id, supabase])

  useEffect(() => {
    fetchAllTimeTrackerData()
  }, [fetchAllTimeTrackerData])

  useEffect(() => {
    fetchTimeTrackerData(filterPeriod, customDateRange)
  }, [filterPeriod, customDateRange, fetchTimeTrackerData])

  const handleFilterChange = (value: string) => {
    setFilterPeriod(value)
    if (value !== 'custom') {
      setCustomDateRange(null)
    }
  }

  const handleCustomDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    setCustomDateRange(dates)
    if (dates && dates[0] && dates[1]) {
      setFilterPeriod('custom')
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const getRoleColor = (role: string) => {
    const colorMap: Record<string, string> = {
      admin: 'red',
      manager: 'blue',
      user: 'green',
      guest: 'default',
    }
    return colorMap[role] || 'default'
  }

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      active: 'green',
      inactive: 'default',
      suspended: 'red',
      pending: 'orange',
    }
    return colorMap[status] || 'default'
  }

  const handleEdit = () => {
    setIsEditing(true)
    form.setFieldsValue({
      full_name: userData.full_name || '',
      role: userData.role,
      status: userData.status,
      phone: userData.phone || '',
      department: userData.department || '',
      position: userData.position || '',
      bio: userData.bio || '',
      timezone: userData.timezone || 'UTC',
      locale: userData.locale || 'en',
      is_email_verified: userData.is_email_verified || false,
      permissions: userData.permissions ? JSON.stringify(userData.permissions, null, 2) : '',
      metadata: userData.metadata ? JSON.stringify(userData.metadata, null, 2) : '',
    })
  }

  const handleCancel = () => {
    setIsEditing(false)
    form.resetFields()
    setAvatarUrl(userData.avatar_url)
  }

  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    try {
      const result = await uploadAvatar(file, userData.id)
      
      if (result.error || !result.url) {
        message.error(result.error || 'Failed to upload avatar')
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

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      // Parse JSON fields
      let permissions = null
      let metadata = null
      
      if (values.permissions) {
        try {
          permissions = JSON.parse(values.permissions)
        } catch (e) {
          message.error('Invalid JSON format for permissions')
          setLoading(false)
          return
        }
      }
      
      if (values.metadata) {
        try {
          metadata = JSON.parse(values.metadata)
        } catch (e) {
          message.error('Invalid JSON format for metadata')
          setLoading(false)
          return
        }
      }

      const updateData: any = {
        full_name: values.full_name,
        role: values.role,
        status: values.status,
        avatar_url: avatarUrl,
        phone: values.phone || null,
        department: values.department || null,
        position: values.position || null,
        bio: values.bio || null,
        timezone: values.timezone || 'UTC',
        locale: values.locale || 'en',
        is_email_verified: values.is_email_verified || false,
        permissions: permissions,
        metadata: metadata,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userData.id)
        .select()
        .single()

      if (error) throw error

      // Update auth metadata if avatar changed
      if (avatarUrl) {
        await supabase.auth.admin.updateUserById(userData.id, {
          user_metadata: {
            avatar_url: avatarUrl,
            full_name: values.full_name,
          },
        })
      }

      setUserData(data)
      setIsEditing(false)
      message.success('User updated successfully')
    } catch (error: any) {
      message.error(error.message || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Space style={{ marginBottom: 24 }}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => router.push('/users')}
              >
                Back to Users
              </Button>
              {!isEditing ? (
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={handleEdit}
                >
                  Edit User
                </Button>
              ) : (
                <Space>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    loading={loading}
                  >
                    Save Changes
                  </Button>
                  <Button
                    icon={<CloseOutlined />}
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </Space>
              )}
            </Space>

            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Avatar
                  size={120}
                  icon={<UserOutlined />}
                  src={avatarUrl || userData.avatar_url}
                  style={{ marginBottom: 16 }}
                />
                {isEditing && (
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
                      type="primary"
                      icon={<UploadOutlined />}
                      loading={uploading}
                      disabled={uploading}
                      style={{ position: 'absolute', bottom: 0, right: 0 }}
                    >
                      {uploading ? 'Uploading...' : 'Upload'}
                    </Button>
                  </Upload>
                )}
              </div>
              <div>
                {isEditing ? (
                  <Form.Item
                    name="full_name"
                    rules={[{ required: true, message: 'Please enter full name!' }]}
                    style={{ marginBottom: 16 }}
                  >
                    <Input size="large" style={{ textAlign: 'center', fontSize: 24, fontWeight: 'bold' }} />
                  </Form.Item>
                ) : (
                  <Title level={2} style={{ marginBottom: 8 }}>
                    {userData.full_name || 'N/A'}
                  </Title>
                )}
                <Space size="middle">
                  {isEditing ? (
                    <>
                      <Form.Item name="role" style={{ margin: 0 }}>
                        <Select style={{ width: 120 }}>
                          <Option value="admin">Admin</Option>
                          <Option value="manager">Manager</Option>
                          <Option value="user">User</Option>
                          <Option value="guest">Guest</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="status" style={{ margin: 0 }}>
                        <Select style={{ width: 120 }}>
                          <Option value="active">Active</Option>
                          <Option value="inactive">Inactive</Option>
                          <Option value="suspended">Suspended</Option>
                          <Option value="pending">Pending</Option>
                        </Select>
                      </Form.Item>
                    </>
                  ) : (
                    <>
                      <Tag color={getRoleColor(userData.role)} style={{ fontSize: 14, padding: '4px 12px' }}>
                        {userData.role?.toUpperCase()}
                      </Tag>
                      <Tag color={getStatusColor(userData.status)} style={{ fontSize: 14, padding: '4px 12px' }}>
                        {userData.status?.toUpperCase()}
                      </Tag>
                    </>
                  )}
                </Space>
              </div>
            </div>

            <Divider />

            <Tabs 
              defaultActiveKey="general" 
              size="large"
              items={[
                {
                  key: 'general',
                  label: (
                    <span>
                      <UserOutlined />
                      General Info
                    </span>
                  ),
                  children: (
                    <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Row gutter={[24, 24]}>
                <Col xs={24} lg={12}>
                  <Card title="Basic Information" size="small">
                    {isEditing ? (
                      <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Form.Item label="Email">
                          <Input prefix={<MailOutlined />} value={userData.email} disabled />
                        </Form.Item>
                        <Form.Item
                          name="full_name"
                          label="Full Name"
                          rules={[{ required: true, message: 'Please enter full name!' }]}
                        >
                          <Input prefix={<UserOutlined />} placeholder="Full Name" />
                        </Form.Item>
                        <Form.Item name="phone" label="Phone">
                          <Input prefix={<PhoneOutlined />} placeholder="Phone Number" />
                        </Form.Item>
                        <Form.Item label="User ID">
                          <Input value={userData.id} disabled />
                        </Form.Item>
                      </Space>
                    ) : (
                      <Descriptions column={1} bordered>
                        <Descriptions.Item label="Email">
                          <Space>
                            <MailOutlined />
                            <Text>{userData.email}</Text>
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Full Name">
                          <Space>
                            <UserOutlined />
                            <Text>{userData.full_name || 'N/A'}</Text>
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Phone">
                          <Space>
                            <PhoneOutlined />
                            <Text>{userData.phone || 'N/A'}</Text>
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="User ID">
                          <Text code style={{ fontSize: 12 }}>
                            {userData.id}
                          </Text>
                        </Descriptions.Item>
                      </Descriptions>
                    )}
                  </Card>
                </Col>

                <Col xs={24} lg={12}>
                  <Card title="Work Information" size="small">
                    {isEditing ? (
                      <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Form.Item name="department" label="Department">
                          <Input prefix={<BankOutlined />} placeholder="Department" />
                        </Form.Item>
                        <Form.Item name="position" label="Position">
                          <Input prefix={<IdcardOutlined />} placeholder="Position/Job Title" />
                        </Form.Item>
                        <Form.Item name="timezone" label="Timezone">
                          <Select prefix={<GlobalOutlined />} placeholder="Select Timezone" showSearch>
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
                        <Form.Item name="locale" label="Locale">
                          <Select prefix={<TranslationOutlined />} placeholder="Select Locale">
                            <Option value="en">English (en)</Option>
                            <Option value="id">Indonesian (id)</Option>
                            <Option value="es">Spanish (es)</Option>
                            <Option value="fr">French (fr)</Option>
                            <Option value="de">German (de)</Option>
                            <Option value="ja">Japanese (ja)</Option>
                            <Option value="zh">Chinese (zh)</Option>
                          </Select>
                        </Form.Item>
                      </Space>
                    ) : (
                      <Descriptions column={1} bordered>
                        <Descriptions.Item label="Department">
                          <Space>
                            <BankOutlined />
                            <Text>{userData.department || 'N/A'}</Text>
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Position">
                          <Space>
                            <IdcardOutlined />
                            <Text>{userData.position || 'N/A'}</Text>
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Timezone">
                          <Space>
                            <GlobalOutlined />
                            <Text>{userData.timezone || 'UTC'}</Text>
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Locale">
                          <Space>
                            <TranslationOutlined />
                            <Text>{userData.locale || 'en'}</Text>
                          </Space>
                        </Descriptions.Item>
                      </Descriptions>
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                <Col xs={24}>
                  <Card title="Bio" size="small">
                    {isEditing ? (
                      <Form.Item name="bio">
                        <TextArea rows={4} placeholder="Bio/Description" />
                      </Form.Item>
                    ) : (
                      <Text>{userData.bio || 'No bio available'}</Text>
                    )}
                  </Card>
                </Col>
              </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col xs={24} lg={12}>
                <Card title="Account Status" size="small">
                  {isEditing ? (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                      <Form.Item name="is_email_verified" label="Email Verified" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item
                        name="role"
                        label="Role"
                        rules={[{ required: true, message: 'Please select role!' }]}
                      >
                        <Select>
                          <Option value="admin">Admin</Option>
                          <Option value="manager">Manager</Option>
                          <Option value="user">User</Option>
                          <Option value="guest">Guest</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item
                        name="status"
                        label="Status"
                        rules={[{ required: true, message: 'Please select status!' }]}
                      >
                        <Select>
                          <Option value="active">Active</Option>
                          <Option value="inactive">Inactive</Option>
                          <Option value="suspended">Suspended</Option>
                          <Option value="pending">Pending</Option>
                        </Select>
                      </Form.Item>
                    </Space>
                  ) : (
                    <Descriptions column={1} bordered>
                      <Descriptions.Item label="Email Verified">
                        <Tag color={userData.is_email_verified ? 'green' : 'red'}>
                          {userData.is_email_verified ? 'Yes' : 'No'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Role">
                        <Tag color={getRoleColor(userData.role)}>
                          {userData.role?.toUpperCase()}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Status">
                        <Tag color={getStatusColor(userData.status)}>
                          {userData.status?.toUpperCase()}
                        </Tag>
                      </Descriptions.Item>
                    </Descriptions>
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card title="Activity" size="small">
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Created At">
                      <Space>
                        <CalendarOutlined />
                        <Text>
                          {userData.created_at 
                            ? new Date(userData.created_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Updated">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.updated_at 
                            ? new Date(userData.updated_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Login">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.last_login_at 
                            ? new Date(userData.last_login_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Never'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Active">
                      <Space>
                        <ClockCircleOutlined />
                        <Text>
                          {userData.last_active_at 
                            ? new Date(userData.last_active_at).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'N/A'}
                        </Text>
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col xs={24} lg={12}>
                <Card title={<><SafetyOutlined /> Permissions</>} size="small">
                  {isEditing ? (
                    <Form.Item
                      name="permissions"
                      tooltip="Enter permissions as JSON object, e.g. {'read': true, 'write': false}"
                    >
                      <TextArea rows={6} placeholder='{"read": true, "write": false}' />
                    </Form.Item>
                  ) : (
                    <Text>
                      <pre style={{ 
                        background: '#f5f5f5', 
                        padding: 12, 
                        borderRadius: 4,
                        overflow: 'auto',
                        maxHeight: 200
                      }}>
                        {userData.permissions 
                          ? JSON.stringify(userData.permissions, null, 2)
                          : 'No permissions set'}
                      </pre>
                    </Text>
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card title={<><DatabaseOutlined /> Metadata</>} size="small">
                  {isEditing ? (
                    <Form.Item
                      name="metadata"
                      tooltip="Enter additional metadata as JSON object"
                    >
                      <TextArea rows={6} placeholder='{"key": "value"}' />
                    </Form.Item>
                  ) : (
                    <Text>
                      <pre style={{ 
                        background: '#f5f5f5', 
                        padding: 12, 
                        borderRadius: 4,
                        overflow: 'auto',
                        maxHeight: 200
                      }}>
                        {userData.metadata 
                          ? JSON.stringify(userData.metadata, null, 2)
                          : 'No metadata set'}
                      </pre>
                    </Text>
                  )}
                </Card>
              </Col>
            </Row>
            </Form>
                  ),
                },
                {
                  key: 'time-tracker',
                  label: (
                    <span>
                      <HistoryOutlined />
                      Log Time Tracker
                    </span>
                  ),
                  children: (
                    <div>
                      {/* Overview Cards */}
                      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col xs={24} sm={8}>
                          <Card>
                            <Statistic
                              title="Today"
                              value={formatDuration(overviewData.today)}
                              prefix={<ClockCircleOutlined />}
                              valueStyle={{ color: '#3f8600' }}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Card>
                            <Statistic
                              title="This Week"
                              value={formatDuration(overviewData.thisWeek)}
                              prefix={<ClockCircleOutlined />}
                              valueStyle={{ color: '#1890ff' }}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Card>
                            <Statistic
                              title="This Month"
                              value={formatDuration(overviewData.thisMonth)}
                              prefix={<ClockCircleOutlined />}
                              valueStyle={{ color: '#722ed1' }}
                            />
                          </Card>
                        </Col>
                      </Row>

                      {/* Filter Section */}
                      <Card style={{ marginBottom: 24 }}>
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                          <div>
                            <Text strong style={{ marginRight: 16 }}>Filter Period:</Text>
                            <Radio.Group 
                              value={filterPeriod} 
                              onChange={(e) => handleFilterChange(e.target.value)}
                              buttonStyle="solid"
                            >
                              <Radio.Button value="all">All</Radio.Button>
                              <Radio.Button value="week">Week</Radio.Button>
                              <Radio.Button value="month">Month</Radio.Button>
                              <Radio.Button value="custom">Custom</Radio.Button>
                            </Radio.Group>
                          </div>
                          {filterPeriod === 'custom' && (
                            <div>
                              <Text strong style={{ marginRight: 16 }}>Select Date Range:</Text>
                              <RangePicker
                                value={customDateRange}
                                onChange={handleCustomDateRangeChange}
                                format="YYYY-MM-DD"
                                allowClear
                              />
                            </div>
                          )}
                        </Space>
                      </Card>

                      {/* Table */}
                      <Card>
                        <Table
                        columns={[
                          {
                            title: 'Todo',
                            key: 'todo',
                            render: (_, record) => (
                              <div>
                                <div style={{ fontWeight: 500 }}>
                                  {record.todo?.title || 'N/A'}
                                </div>
                                {record.todo?.description && (
                                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                                    {record.todo.description.length > 50 
                                      ? `${record.todo.description.substring(0, 50)}...`
                                      : record.todo.description}
                                  </div>
                                )}
                              </div>
                            ),
                          },
                          {
                            title: 'Start Time',
                            dataIndex: 'start_time',
                            key: 'start_time',
                            render: (date: string) => (
                              <Space>
                                <ClockCircleOutlined />
                                <Text>
                                  {date 
                                    ? new Date(date).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })
                                    : 'N/A'}
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            title: 'Stop Time',
                            dataIndex: 'stop_time',
                            key: 'stop_time',
                            render: (date: string | null) => (
                              <Space>
                                <ClockCircleOutlined />
                                <Text>
                                  {date 
                                    ? new Date(date).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })
                                    : <Tag color="processing">Active</Tag>}
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            title: 'Duration',
                            dataIndex: 'duration_seconds',
                            key: 'duration_seconds',
                            render: (seconds: number | null) => {
                              if (!seconds) return <Tag color="processing">Active</Tag>
                              const hours = Math.floor(seconds / 3600)
                              const minutes = Math.floor((seconds % 3600) / 60)
                              const secs = seconds % 60
                              return (
                                <Text>
                                  {hours > 0 ? `${hours}h ` : ''}
                                  {minutes > 0 ? `${minutes}m ` : ''}
                                  {secs > 0 ? `${secs}s` : ''}
                                </Text>
                              )
                            },
                          },
                          {
                            title: 'Created At',
                            dataIndex: 'created_at',
                            key: 'created_at',
                            render: (date: string) => (
                              <Space>
                                <CalendarOutlined />
                                <Text>
                                  {date 
                                    ? new Date(date).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : 'N/A'}
                                </Text>
                              </Space>
                            ),
                          },
                        ]}
                        dataSource={timeTrackerData}
                        rowKey="id"
                        loading={timeTrackerLoading}
                        pagination={{
                          pageSize: 10,
                          showSizeChanger: true,
                          showTotal: (total) => `Total ${total} time tracker records`,
                        }}
                        locale={{
                          emptyText: 'No time tracker records found',
                        }}
                      />
                    </Card>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}

