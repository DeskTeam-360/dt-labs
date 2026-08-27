'use client'

import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Badge,
  Button,
  Card,
  Col,
  Layout,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'

import type { ConnectionCheckResult } from '@/app/api/settings/connection-check/route'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

interface ConnectionStatusContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

function StatusIcon({ status }: { status: ConnectionCheckResult['status'] }) {
  if (status === 'ok') return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
  if (status === 'error') return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
  return <MinusCircleOutlined style={{ color: '#d9d9d9', fontSize: 20 }} />
}

function StatusTag({ status }: { status: ConnectionCheckResult['status'] }) {
  if (status === 'ok') return <Tag color="success">Connected</Tag>
  if (status === 'error') return <Tag color="error">Error</Tag>
  return <Tag color="default">Not configured</Tag>
}

export default function ConnectionStatusContent({ user: currentUser }: ConnectionStatusContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ConnectionCheckResult[]>([])
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/connection-check', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { results: ConnectionCheckResult[]; checkedAt: string }
      setResults(body.results)
      setCheckedAt(body.checkedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void runCheck()
  }, [runCheck])

  const okCount = results.filter((r) => r.status === 'ok').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24 }}>
          <Space direction="vertical" size={4} style={{ marginBottom: 20 }}>
            <Title level={2} style={{ margin: 0 }}>Connection Status</Title>
            <Text type="secondary">Check external service connectivity (admin only).</Text>
          </Space>

          <Space style={{ marginBottom: 20 }} wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void runCheck()}
              loading={loading}
              type="primary"
            >
              Re-check all
            </Button>
            {checkedAt && !loading && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Last checked: {new Date(checkedAt).toLocaleString()}
              </Text>
            )}
            {results.length > 0 && !loading && (
              <Space size={8}>
                <Badge count={okCount} color="#52c41a" />
                <Text style={{ fontSize: 12 }}>OK</Text>
                <Badge count={errorCount} color={errorCount > 0 ? '#ff4d4f' : '#d9d9d9'} />
                <Text style={{ fontSize: 12 }}>Error</Text>
              </Space>
            )}
          </Space>

          {error && (
            <Card style={{ marginBottom: 16, borderColor: '#ff4d4f' }}>
              <Text type="danger">{error}</Text>
            </Card>
          )}

          {loading && results.length === 0 ? (
            <Spin tip="Checking connections…" />
          ) : (
            <Row gutter={[16, 16]}>
              {results.map((r) => (
                <Col key={r.key} xs={24} sm={12} md={8}>
                  <Card
                    styles={{ body: { padding: '16px 20px' } }}
                    style={{
                      borderColor:
                        r.status === 'ok'
                          ? '#b7eb8f'
                          : r.status === 'error'
                            ? '#ffa39e'
                            : undefined,
                    }}
                  >
                    <Space align="start" size={12}>
                      <div style={{ paddingTop: 2 }}>
                        {loading ? <Spin size="small" /> : <StatusIcon status={r.status} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space size={8} align="center" wrap>
                          <Text strong style={{ fontSize: 14 }}>{r.label}</Text>
                          <StatusTag status={r.status} />
                        </Space>
                        <Text
                          type={r.status === 'error' ? 'danger' : 'secondary'}
                          style={{ fontSize: 12, display: 'block', marginTop: 4, wordBreak: 'break-word' }}
                        >
                          {r.message}
                        </Text>
                        {r.latencyMs !== undefined && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {r.latencyMs} ms
                          </Text>
                        )}
                      </div>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          <div style={{ marginTop: 24 }}>
            <SpaNavLink href="/settings">← Back to settings</SpaNavLink>
          </div>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
