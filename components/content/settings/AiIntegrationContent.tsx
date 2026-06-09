'use client'

import { ApiOutlined, ArrowLeftOutlined, CheckCircleOutlined, RobotOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Layout, Space, Tag, Typography } from 'antd'
import Link from 'next/link'
import { useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { AiChatPublicConfig } from '@/lib/ai-chat-config'

const { Content } = Layout
const { Title, Text } = Typography

interface AiIntegrationContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  config: AiChatPublicConfig
  availableModels: string[]
}

export default function AiIntegrationContent({
  user: currentUser,
  config,
  availableModels,
}: AiIntegrationContentProps) {
  const [collapsed, setCollapsed] = useState(false)

  const providerColor = config.provider === 'codex' ? 'purple' : 'blue'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>
                  <Link href="/settings">Back to Settings</Link>
                </Button>
                <Title level={3} className="settings-section-heading" style={{ margin: '8px 0 0' }}>
                  AI Integration
                </Title>
                <Text type="secondary">
                  Provider dan model yang dipakai untuk fitur AI (mis. ringkasan komentar tiket).
                  Konfigurasi lewat file <Text code>.env</Text> di server.
                </Text>
              </div>

              {!config.configured ? (
                <Alert
                  type="error"
                  showIcon
                  message="Konfigurasi AI belum lengkap"
                  description={config.configError}
                />
              ) : (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message="Konfigurasi AI aktif"
                  description={`Saat ini memakai ${config.providerLabel} dengan model ${config.model}.`}
                />
              )}

              <Descriptions bordered column={1} size="middle">
                <Descriptions.Item label="Provider">
                  <Space>
                    <Tag color={providerColor} icon={<RobotOutlined />}>
                      {config.provider}
                    </Tag>
                    <Text>{config.providerLabel}</Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Model aktif">
                  <Tag color="green">{config.model}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Base URL">
                  <Text code>{config.baseUrl || '—'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="API key">
                  {config.apiKeyConfigured ? (
                    <Tag color="success">Terisi</Tag>
                  ) : (
                    <Tag color="error">Belum di-set</Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>

              {config.provider === 'codex' && (
                <Card size="small" title="Model tersedia di proxy Codex" type="inner">
                  {availableModels.length > 0 ? (
                    <Space size={[8, 8]} wrap>
                      {availableModels.map((modelId) => (
                        <Tag
                          key={modelId}
                          color={modelId === config.model ? 'green' : 'default'}
                          icon={modelId === config.model ? <CheckCircleOutlined /> : undefined}
                        >
                          {modelId}
                          {modelId === config.model ? ' (aktif)' : ''}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Text type="secondary">
                      Tidak bisa mengambil daftar model dari proxy. Pastikan VPS Codex berjalan dan{' '}
                      <Text code>CODEX_BASE_URL</Text> benar.
                    </Text>
                  )}
                </Card>
              )}

              <Card size="small" title="Variabel environment" type="inner" extra={<ApiOutlined />}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label={config.envVars.provider}>
                    <Text code>AI_PROVIDER={config.provider}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={config.envVars.model}>
                    <Text code>
                      {config.envVars.model}={config.model}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={config.envVars.baseUrl}>
                    <Text code>
                      {config.envVars.baseUrl}={config.baseUrl || '(kosong)'}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={config.envVars.apiKey}>
                    <Text code>
                      {config.envVars.apiKey}={config.apiKeyConfigured ? '***' : '(belum di-set)'}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
                <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                  Untuk ganti provider, set <Text code>AI_PROVIDER=openai</Text> atau{' '}
                  <Text code>AI_PROVIDER=codex</Text>, lalu restart aplikasi.
                </Text>
              </Card>
            </Space>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
