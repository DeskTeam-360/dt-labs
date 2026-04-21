'use client'

import {
  AppstoreOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  FileTextOutlined,
  FlagOutlined,
  InfoCircleOutlined,
  MailOutlined,
  NotificationOutlined,
  SettingOutlined,
  TagOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Col, Layout, Row, Typography } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'

import {
  canAccessAutomationRules,
  canAccessCompanies,
  canAccessCompanyLog,
  canAccessEmailIntegration,
  canAccessKnowledgeBase,
  canAccessMessageTemplates,
  canAccessRecapSnapshots,
  canAccessSlackNotifications,
  canAccessTeams,
  canAccessTicketAttributes,
  canAccessUsers,
  canManageDashboardAnnouncements,
  canManageGlobalAnnouncement,
} from '@/lib/auth-utils'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'
import { SpaNavLink } from '../SpaNavLink'

const { Content } = Layout
const { Title, Text } = Typography

const tileStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  padding: 20,
  gap: 20,
  alignItems: 'center',
  borderRadius: 12,
  background: 'var(--settings-hub-tile-bg)',
  border: '1px solid var(--settings-hub-tile-border)',
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
        <Text strong style={{ fontSize: 15, display: 'block', color: 'var(--settings-hub-tile-title)' }}>
          {title}
        </Text>
        {description ? (
          <Text style={{ fontSize: 13, display: 'block', color: 'var(--settings-hub-tile-desc)' }}>
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
      <Title level={4} className="settings-section-heading" style={{ marginTop: 0, marginBottom: 16 }}>
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

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 24 }}>
            <Title level={2} className="settings-section-heading" style={{ margin: 0 }}>
              Settings
            </Title>
            <Text style={{ color: 'var(--settings-hub-tile-desc)' }}>
              Configure ticket catalogs, automation, and general options
            </Text>
          </div>

          {canAccessTicketAttributes(role) && (
            <Section heading="Ticket Attributes">
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Statuses"
                    description="Workflow states and kanban columns"
                    href="/settings/ticket-statuses"
                    icon={<SettingOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Types"
                    description="Request categories (bug, feature, …)"
                    href="/settings/ticket-types"
                    icon={<AppstoreOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Ticket Priorities"
                    description="Urgency levels and ordering"
                    href="/settings/ticket-priorities"
                    icon={<FlagOutlined />}
                  />
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <HubTile
                    title="Tags"
                    description="Labels for organizing tickets"
                    href="/settings/tags"
                    icon={<TagOutlined />}
                  />
                </Col>
              </Row>
            </Section>
          )}

          {(canAccessEmailIntegration(role) ||
            canAccessSlackNotifications(role) ||
            canAccessMessageTemplates(role) ||
            canAccessAutomationRules(role)) && (
            <Section heading="Automation">
              <Row gutter={[16, 16]}>
                {canAccessEmailIntegration(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Email Integration"
                      description="Inbound mail and threading"
                      href="/settings/email-integration"
                      icon={<MailOutlined />}
                    />
                  </Col>
                )}
                {canAccessSlackNotifications(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Slack notifications"
                      description="Ticket alerts to a Slack channel"
                      href="/settings/slack-notifications"
                      icon={<BellOutlined />}
                    />
                  </Col>
                )}
                {canAccessMessageTemplates(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Message Templates"
                      description="Notification and reply templates"
                      href="/settings/message-templates"
                      icon={<FileTextOutlined />}
                    />
                  </Col>
                )}
                {canAccessAutomationRules(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Automation Rules"
                      description="Triggers and actions on tickets"
                      href="/settings/automation-rules"
                      icon={<ThunderboltOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}

          {(canAccessUsers(role) || canAccessCompanies(role) || canAccessTeams(role)) && (
            <Section heading="People & access">
              <Row gutter={[16, 16]}>
                {canAccessUsers(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Users"
                      description="Login accounts, roles, and company assignment"
                      href="/settings/users"
                      icon={<UserOutlined />}
                    />
                  </Col>
                )}
                {canAccessCompanies(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Companies"
                      description="Organizations, portal members, and company data"
                      href="/settings/companies"
                      icon={<BankOutlined />}
                    />
                  </Col>
                )}
                {canAccessTeams(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Teams"
                      description="Groups for assignments and ticket visibility"
                      href="/settings/teams"
                      icon={<TeamOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}

          {(canAccessKnowledgeBase(role) ||
            canManageGlobalAnnouncement(role) ||
            canManageDashboardAnnouncements(role) ||
            canAccessCompanyLog(role) ||
            canAccessRecapSnapshots(role)) && (
            <Section heading="General">
              <Row gutter={[16, 16]}>
                {canAccessKnowledgeBase(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Knowledge Base"
                      description="Help articles for customers"
                      href="/settings/knowledge-base"
                      icon={<InfoCircleOutlined />}
                    />
                  </Col>
                )}
                {canManageGlobalAnnouncement(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Global announcement"
                      description="Running banner with start and end schedule"
                      href="/settings/global-announcement"
                      icon={<NotificationOutlined />}
                    />
                  </Col>
                )}
                {canManageDashboardAnnouncements(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Dashboard announcements"
                      description="Title on dashboard, full text in a modal; by role"
                      href="/settings/dashboard-announcements"
                      icon={<BellOutlined />}
                    />
                  </Col>
                )}
                {canAccessCompanyLog(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Company Log"
                      description="Raw daily snapshots (active team, manager, time) per company"
                      href="/settings/company-log"
                      icon={<FileTextOutlined />}
                    />
                  </Col>
                )}
                {canAccessRecapSnapshots(role) && (
                  <Col xs={24} sm={12} md={8}>
                    <HubTile
                      title="Recap snapshots"
                      description="Saved Customer time report recaps (month or week)"
                      href="/settings/recap-snapshots"
                      icon={<BarChartOutlined />}
                    />
                  </Col>
                )}
              </Row>
            </Section>
          )}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
