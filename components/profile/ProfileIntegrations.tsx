'use client'

import { CopyOutlined, DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Divider, message, Popconfirm, Space, Tag, Typography } from 'antd'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

import ApiKeysContent from '@/components/content/settings/ApiKeysContent'
import { canManageApiKeys } from '@/lib/auth-utils'

const { Title, Text } = Typography

interface ApiToken {
  id: string
  token: string
  name: string
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

/** The parts only the signed-in person sees on their own profile: AI connections and the Chrome Extension tokens. */
export default function ProfileIntegrations({ user }: { user: { id: string; email?: string | null; name?: string | null } }) {
  const { data: clientSession } = useSession()
  const myRole = ((clientSession?.user as { role?: string } | undefined)?.role ?? '').toLowerCase()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)

  const fetchTokens = async () => {
    setLoadingTokens(true)
    try {
      const res = await fetch('/api/auth/tokens')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tokens')
      setTokens(data.tokens || [])
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to fetch tokens')
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

  const handleDeleteToken = async (tokenId: string) => {
    try {
      const res = await fetch(`/api/auth/tokens/${tokenId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete token')
      message.success('Token deleted successfully')
      fetchTokens()
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to delete token')
    }
  }

  // Copy token to clipboard
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    message.success('Token copied to clipboard!')
  }

  return (
    <>
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
                  <Space orientation="vertical" style={{ width: '100%' }}>
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
                        <Space orientation="vertical" style={{ width: '100%' }}>
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
      {myRole && canManageApiKeys(myRole) ? (
        <Card style={{ marginTop: 24 }}>
          <Title level={3}>AI connections</Title>
          <ApiKeysContent user={{ id: user.id, email: user.email, name: user.name, role: myRole }} embedded />
        </Card>
      ) : null}
    </>
  )
}
