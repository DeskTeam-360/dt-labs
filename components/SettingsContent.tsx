'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Layout, Row, Col, Typography } from 'antd'
import {
  SettingOutlined,
  AppstoreOutlined,
  FlagOutlined,
  TagOutlined,
  MailOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import AdminSidebar from './AdminSidebar'
import { SpaNavLink } from './SpaNavLink'
import {
  canAccessTicketAttributes,
  canAccessEmailIntegration,
  canAccessMessageTemplates,
  canAccessKnowledgeBase,
  canAccessAutomationRules,
} from '@/lib/auth-utils'

const { Content } = Layout
const { Title, Text } = Typography

const tileStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  padding: 20,
  gap: 20,
  // textAlign: 'center',
  // justifyContent: 'center',
  alignItems: 'center',
  borderRadius: 12,
  background: '#fff',
  border: '1px solid #f0f0f0',
  transition: 'background 0.2s, box-shadow 0.2s',
}

interface HubTileProps {
  title: string
  description?: string
  href: string
  icon: ReactNode
}

function HubTile({ title, description, href, icon }: HubTileProps) {
  return (
    <SpaNavLink
      href={href}
      style={{ display: 'block', height: '100%', color: 'inherit' }}
      className="settings-hub-tile-link"
    >
      <div
        className="settings-hub-tile"
        style={tileStyle}
      >
        <div style={{ fontSize: 22, color: '#1890ff', marginBottom: 12 }}>{icon}</div>
        <div>
        <Text strong style={{ fontSize: 15, display: 'block' }}>
          {title}
        </Text>
        {description ? (
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            {description}
          </Text>
        ) : null}
        </div>
        
      </div>
    </SpaNavLink>
  )
}

interface SectionProps {
  heading: string
  children: ReactNode
}

function Section({ heading, children }: SectionProps) {
  return (
    <section style={{ marginBottom: 32 }}>
      <Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
        {heading}
      </Title>
      {children}
    </section>
  )
}

interface SettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function SettingsContent({ user: currentUser }: SettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const role = (currentUser.role ?? '').toLowerCase()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{
          ...currentUser,
          role: currentUser.role ?? undefined,
        }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <Layout
        style={{
          marginLeft: collapsed ? 80 : 250,
          transition: 'margin-left 0.2s',
          background: '#f0f2f5',
          minHeight: '100vh',
        }}
      >
        <Content style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 24 }}>
            <Title level={2} style={{ margin: 0 }}>
              Settings
            </Title>
            <Text type="secondary">Configure ticket catalogs, automation, and general options</Text>
          </div>

          {canAccessTicketAttributes(role) && (
            <Section heading="Ticket Attributes">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Statuses"
                    description="Workflow states and kanban columns"
                    href="/ticket-statuses"
                    icon={<SettingOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Types"
                    description="Request categories (bug, feature, …)"
                    href="/ticket-types"
                    icon={<AppstoreOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Priorities"
                    description="Urgency levels and ordering"
                    href="/ticket-priorities"
                    icon={<FlagOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Tags"
                    description="Labels for organizing tickets"
                    href="/tags"
                    icon={<TagOutlined />}
                  />
                </Col>
              </Row>
            </Section>
          )}

          {(canAccessEmailIntegration(role) ||
            canAccessMessageTemplates(role) ||
            canAccessAutomationRules(role)) && (
            <Section heading="Automation">
              <Row gutter={[16, 16]}>
                {canAccessEmailIntegration(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Email Integration"
                      description="Inbound mail and threading"
                      href="/email-integration"
                      icon={<MailOutlined />}
                    />
                  </Col>
                )}
                {canAccessMessageTemplates(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Message Templates"
                      description="Notification and reply templates"
                      href="/message-templates"
                      icon={<FileTextOutlined />}
                    />
                  </Col>
                )}
                {canAccessAutomationRules(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Automation Rules"
                      description="Triggers and actions on tickets"
                      href="/automation-rules"
                      icon={<ThunderboltOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}

          {canAccessKnowledgeBase(role) && (
            <Section heading="General">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Knowledge Base"
                    description="Help articles for customers"
                    href="/knowledge-base"
                    icon={<InfoCircleOutlined />}
                  />
                </Col>
              </Row>
            </Section>
          )}
        </Content>
      </Layout>
    </Layout>
  )
}
