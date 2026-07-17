'use client'

import { ArrowLeftOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
  Form,
  Layout,
  message,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import {
  DEFAULT_TICKET_VISIBILITY_RULES,
  describeVisibilityRule,
  TICKET_VISIBILITY_LEVELS,
  TICKET_VISIBILITY_OPTIONS,
  TICKET_VISIBILITY_ROLES,
  type TicketVisibilityLevel,
  type TicketVisibilityRulesMap,
  VISIBILITY_SETTINGS_DEPARTMENTS,
  VISIBILITY_SETTINGS_POSITIONS,
  type VisibilityAudienceRule,
} from '@/lib/ticket-visibility'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

type FormShape = Record<TicketVisibilityLevel, VisibilityAudienceRule>

const ROLE_OPTIONS = TICKET_VISIBILITY_ROLES.map((r) => ({
  label: r.charAt(0).toUpperCase() + r.slice(1),
  value: r,
}))

const DEPT_OPTIONS = VISIBILITY_SETTINGS_DEPARTMENTS.map((d) => ({ label: d, value: d }))
const POS_OPTIONS = VISIBILITY_SETTINGS_POSITIONS.map((p) => ({ label: p, value: p }))

export default function TicketVisibilityContent({ user }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm<FormShape>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const watched = Form.useWatch([], form) as Partial<FormShape> | undefined

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/ticket-visibility')
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      form.setFieldsValue(json.data as TicketVisibilityRulesMap)
    } catch {
      messageApi.error('Failed to load visibility settings')
      form.setFieldsValue(structuredClone(DEFAULT_TICKET_VISIBILITY_RULES))
    } finally {
      setLoading(false)
    }
  }, [form, messageApi])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async (values: FormShape) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/ticket-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values }),
      })
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      form.setFieldsValue(json.data)
      messageApi.success('Visibility settings saved')
    } catch {
      messageApi.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const resetDefaults = () => {
    form.setFieldsValue(structuredClone(DEFAULT_TICKET_VISIBILITY_RULES))
    messageApi.info('Reset to defaults — click Save to persist')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder}
      <AdminSidebar
        user={{ ...user, role: user.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, maxWidth: 880 }}>
          <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 8 }}>
            <Link href="/settings">Back to Settings</Link>
          </Button>

          <Title level={3} className="settings-section-heading" style={{ margin: '0 0 4px' }}>
            Ticket Visibility
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            Configure who can see tickets for each visibility level (used by recurring tickets and
            tickets created from them). Matching is by role, department, and/or position.
          </Paragraph>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            disabled={loading}
            initialValues={structuredClone(DEFAULT_TICKET_VISIBILITY_RULES)}
          >
            {TICKET_VISIBILITY_LEVELS.map((level) => {
              const label = TICKET_VISIBILITY_OPTIONS.find((o) => o.value === level)?.label ?? level
              const rule = (watched?.[level] ?? DEFAULT_TICKET_VISIBILITY_RULES[level]) as VisibilityAudienceRule
              return (
                <Card
                  key={level}
                  size="small"
                  title={
                    <Space>
                      <EyeOutlined />
                      <span>{label}</span>
                    </Space>
                  }
                  style={{ marginBottom: 16 }}
                  extra={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {describeVisibilityRule(level, rule)}
                    </Text>
                  }
                >
                  <Form.Item name={[level, 'includeTeamMembers']} valuePropName="checked" style={{ marginBottom: 12 }}>
                    <Checkbox>Include ticket team members</Checkbox>
                  </Form.Item>

                  <Form.Item
                    name={[level, 'matchAllExceptExcluded']}
                    label="Match mode"
                    valuePropName="checked"
                    style={{ marginBottom: 12 }}
                    tooltip="When on, everyone matches except the excluded roles below"
                  >
                    <Switch checkedChildren="Everyone except…" unCheckedChildren="Match lists" />
                  </Form.Item>

                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, next) =>
                      prev?.[level]?.matchAllExceptExcluded !== next?.[level]?.matchAllExceptExcluded
                    }
                  >
                    {() => {
                      const except = form.getFieldValue([level, 'matchAllExceptExcluded'])
                      if (except) {
                        return (
                          <Form.Item
                            name={[level, 'excludeRoles']}
                            label="Excluded roles"
                            initialValue={[]}
                          >
                            <Select mode="multiple" allowClear options={ROLE_OPTIONS} placeholder="e.g. staff, customer" />
                          </Form.Item>
                        )
                      }
                      return (
                        <>
                          <Form.Item name={[level, 'roles']} label="Roles" initialValue={[]}>
                            <Select mode="multiple" allowClear options={ROLE_OPTIONS} placeholder="Select roles" />
                          </Form.Item>
                          <Form.Item name={[level, 'departments']} label="Departments" initialValue={[]}>
                            <Select mode="multiple" allowClear options={DEPT_OPTIONS} placeholder="Select departments" />
                          </Form.Item>
                          <Form.Item name={[level, 'positions']} label="Positions" initialValue={[]}>
                            <Select mode="multiple" allowClear options={POS_OPTIONS} placeholder="Select positions" />
                          </Form.Item>
                          <Form.Item name={[level, 'excludeRoles']} hidden initialValue={[]}>
                            <Select mode="multiple" options={ROLE_OPTIONS} />
                          </Form.Item>
                        </>
                      )
                    }}
                  </Form.Item>
                </Card>
              )
            })}

            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={loading}>
                Reload
              </Button>
              <Button onClick={resetDefaults}>Reset to defaults</Button>
            </Space>
          </Form>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
