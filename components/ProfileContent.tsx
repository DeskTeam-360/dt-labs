'use client'

import { Layout, Card, Form, Input, Button, Typography, message, Avatar, Space, Upload, Select, Row, Col, Divider, Tag, Popconfirm } from 'antd'
import { UserOutlined, MailOutlined, UploadOutlined, PhoneOutlined, BankOutlined, IdcardOutlined, GlobalOutlined, TranslationOutlined, KeyOutlined, CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { uploadAvatar } from '@/utils/storage'
import AdminSidebar from './AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

interface ProfileContentProps {
  user: User
  userData?: any
}

interface ApiToken {
  id: string
  token: string
  name: string
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export default function ProfileContent({ user, userData }: ProfileContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(userData?.avatar_url || user.user_metadata?.avatar_url || null)
  const [form] = Form.useForm()
  const supabase = createClient()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)

  useEffect(() => {
    if (userData) {
      form.setFieldsValue({
        email: user.email,
        full_name: userData.full_name || user.user_metadata?.full_name || '',
        phone: userData.phone || '',
        department: userData.department || '',
        position: userData.position || '',
        bio: userData.bio || '',
        timezone: userData.timezone || 'UTC',
        locale: userData.locale || 'en',
      })
      setAvatarUrl(userData.avatar_url || user.user_metadata?.avatar_url || null)
    }
  }, [userData, form, user])

  // Fetch API tokens
  const fetchTokens = async () => {
    setLoadingTokens(true)
    try {
      const { data, error } = await supabase
        .from('api_tokens')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTokens(data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch tokens')
    } finally {
      setLoadingTokens(false)
    }
  }

  useEffect(() => {
    fetchTokens()
  }, [user.id])

  // Generate new token
  const handleGenerateToken = async () => {
    setGeneratingToken(true)
    try {
      const response = await fetch('/api/auth/token/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Chrome Extension' }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate token')
      }

      setNewToken(result.token)
      message.success('Token generated successfully! Copy it now - it won\'t be shown again.')
      fetchTokens()
    } catch (error: any) {
      message.error(error.message || 'Failed to generate token')
    } finally {
      setGeneratingToken(false)
    }
  }

  // Delete token
  const handleDeleteToken = async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('api_tokens')
        .delete()
        .eq('id', tokenId)
        .eq('user_id', user.id)

      if (error) throw error

      message.success('Token deleted successfully')
      fetchTokens()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete token')
    }
  }

  // Copy token to clipboard
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    message.success('Token copied to clipboard!')
  }

  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    try {
      const result = await uploadAvatar(file, user.id)
      
      if (result.error || !result.url) {
        message.error(result.error || 'Failed to upload avatar. Please check storage bucket permissions.')
        console.error('Upload error details:', result.error)
        return
      }

      setAvatarUrl(result.url)

      // Update avatar URL in auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          avatar_url: result.url,
        },
      })

      if (authError) throw authError

      // Update avatar URL in users table
      const { error: userError } = await supabase
        .from('users')
        .update({
          avatar_url: result.url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (userError) throw userError

      message.success('Avatar uploaded successfully!')
    } catch (error: any) {
      message.error(error.message || 'Failed to upload avatar')
    } finally {
      setUploading(false)
    }
  }

  const onFinish = async (values: any) => {
    setLoading(true)
    try {
      // Update user metadata in auth
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: values.full_name,
          avatar_url: avatarUrl,
        },
      })

      if (authError) throw authError

      // Update user record in users table with all fields
      const { error: userError } = await supabase
        .from('users')
        .update({
          full_name: values.full_name,
          avatar_url: avatarUrl,
          phone: values.phone || null,
          department: values.department || null,
          position: values.position || null,
          bio: values.bio || null,
          timezone: values.timezone || 'UTC',
          locale: values.locale || 'en',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (userError) throw userError

      message.success('Profile updated successfully!')
      
      // Refresh the page to show updated data
      window.location.reload()
    } catch (error: any) {
      message.error(error.message || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Title level={2}>Edit Profile</Title>
            <Text type="secondary">Update your profile information</Text>

            <div style={{ marginTop: 32, marginBottom: 32, textAlign: 'center' }}>
              <Space direction="vertical" size="large">
                <div>
                  <Avatar
                    size={100}
                    icon={<UserOutlined />}
                    src={avatarUrl || user.user_metadata?.avatar_url}
                  />
                  <div style={{ marginTop: 16 }}>
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
                </div>
                <div>
                  <Text strong style={{ fontSize: 18, display: 'block' }}>
                    {user.user_metadata?.full_name || 'User'}
                  </Text>
                  <Text type="secondary">{user.email}</Text>
                </div>
              </Space>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Please enter your email!' },
                      { type: 'email', message: 'Invalid email!' }
                    ]}
                  >
                    <Input
                      prefix={<MailOutlined />}
                      disabled
                      style={{ background: '#f5f5f5' }}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  <Form.Item
                    name="full_name"
                    label="Full Name"
                    rules={[{ required: true, message: 'Full name is required!' }]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="Full Name"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="phone"
                    label="Phone"
                  >
                    <Input
                      prefix={<PhoneOutlined />}
                      placeholder="Phone Number"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  <Form.Item
                    name="department"
                    label="Department"
                  >
                    <Input
                      prefix={<BankOutlined />}
                      placeholder="Department"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="position"
                    label="Position"
                  >
                    <Input
                      prefix={<IdcardOutlined />}
                      placeholder="Position/Job Title"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  <Form.Item
                    name="timezone"
                    label="Timezone"
                  >
                    <Select
                      placeholder="Select Timezone"
                      showSearch
                      filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                    >
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
                      <Option value="Australia/Sydney">Australia/Sydney (AEST)</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="locale"
                    label="Language/Locale"
                  >
                    <Select
                      placeholder="Select Language"
                    >
                      <Option value="en">English</Option>
                      <Option value="es">Spanish</Option>
                      <Option value="fr">French</Option>
                      <Option value="de">German</Option>
                      <Option value="ja">Japanese</Option>
                      <Option value="zh">Chinese</Option>
                      <Option value="id">Indonesian</Option>
                      <Option value="pt">Portuguese</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="bio"
                label="Bio"
              >
                <TextArea
                  rows={4}
                  placeholder="Tell us about yourself..."
                  maxLength={500}
                  showCount
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} size="large">
                  Save Changes
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card style={{ marginTop: 24 }}>
            <Title level={3}>
              <KeyOutlined /> API Tokens for Chrome Extension
            </Title>
            <Text type="secondary">
              Generate API tokens to use with the Chrome Extension. Tokens expire after 30 days.
            </Text>

            {newToken && (
              <Card
                type="inner"
                style={{ marginTop: 16, marginBottom: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>New Token Generated!</Text>
                  <Text code style={{ fontSize: 12, wordBreak: 'break-all', display: 'block' }}>
                    {newToken}
                  </Text>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyToken(newToken)}
                    size="small"
                  >
                    Copy Token
                  </Button>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    ⚠️ Save this token now. You won't be able to see it again!
                  </Text>
                </Space>
              </Card>
            )}

            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleGenerateToken}
                loading={generatingToken}
              >
                Generate New Token
              </Button>
            </div>

            <Divider />

            <div>
              <Text strong>Your Tokens:</Text>
              {loadingTokens ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Text type="secondary">Loading...</Text>
                </div>
              ) : tokens.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Text type="secondary">No tokens yet. Generate one to get started.</Text>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  {tokens.map((token) => (
                    <Card
                      key={token.id}
                      size="small"
                      style={{ marginBottom: 8 }}
                      actions={[
                        <Popconfirm
                          title="Delete this token?"
                          description="This action cannot be undone."
                          onConfirm={() => handleDeleteToken(token.id)}
                          okText="Yes"
                          cancelText="No"
                        >
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                          >
                            Delete
                          </Button>
                        </Popconfirm>,
                      ]}
                    >
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div>
                          <Text strong>{token.name}</Text>
                          {token.is_active ? (
                            <Tag color="green" style={{ marginLeft: 8 }}>Active</Tag>
                          ) : (
                            <Tag color="red" style={{ marginLeft: 8 }}>Inactive</Tag>
                          )}
                        </div>
                        <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                          {token.token.substring(0, 20)}...
                        </Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Created: {new Date(token.created_at).toLocaleDateString()}
                            {token.last_used_at && (
                              <> • Last used: {new Date(token.last_used_at).toLocaleDateString()}</>
                            )}
                            {token.expires_at && (
                              <> • Expires: {new Date(token.expires_at).toLocaleDateString()}</>
                            )}
                          </Text>
                        </div>
                      </Space>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}

