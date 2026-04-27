'use client'

import { SaveOutlined } from '@ant-design/icons'
import { Button, Card, Divider,Form, Input, Layout, message, Space, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import TabInfo from '@/components/company/TabInfo'
import CustomerPortalTeamSection from '@/components/customer-portal/CustomerPortalTeamSection'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

function ColorPickerInput({
  value,
  onChange,
}: {
  value?: string
  onChange?: (v: string) => void
}) {
  const hex = value || '#000000'
  return (
    <Space align="center">
      <Input
        type="color"
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ width: 48, height: 32, padding: 2, cursor: 'pointer' }}
      />
      <Input
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#000000"
        style={{ width: 120 }}
      />
    </Space>
  )
}

interface CustomerCompanySettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string; user_metadata?: { full_name?: string | null } }
  /** Full company row + relations from `getCompanyDetail` (same shape as admin company page). */
  companyData: Record<string, unknown>
  /** When true, show team management (add portal users, reset passwords). Set by staff as company “portal admin”. */
  isCompanyPortalAdmin?: boolean
}

export default function CustomerCompanySettingsContent({
  user,
  companyData,
  isCompanyPortalAdmin = false,
}: CustomerCompanySettingsContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const groupedDatas = useMemo(() => {
    const list = (companyData.company_datas as unknown[] | undefined) || []
    return list.reduce((acc: Record<string, any[]>, item: unknown) => {
      const row = item as { company_data_templates?: { group?: string | null } | null }
      const group = row.company_data_templates?.group || 'Other'
      if (!acc[group]) acc[group] = []
      acc[group].push(item)
      return acc
    }, {})
  }, [companyData.company_datas])

  const companyId = String(companyData.id ?? '')

  const onFinish = async (values: { name: string; email?: string; color?: string }) => {
    const name = (values.name ?? '').trim()
    if (!name) {
      message.warning('Company name is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          email: (values.email ?? '').trim() || null,
          color: (values.color || '#000000').trim() || '#000000',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      message.success('Company info saved')
      router.refresh()
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: 24 }}>
          <Card>
            <Title level={2} style={{ marginTop: 0 }}>
              Company info
            </Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
              View your organization details.
              {isCompanyPortalAdmin
                ? ' As portal admin you can update name, email, and brand color below.'
                : ' Only a portal admin can change company contact and branding; everyone in the company can see portal accounts.'}
            </Text>

            <TabInfo companyData={companyData as any} groupedDatas={groupedDatas} />

            <CustomerPortalTeamSection
              companyId={companyId}
              canManagePortal={isCompanyPortalAdmin}
              currentUserId={user.id}
            />

            <Divider />

            <Title level={4}>Contact &amp; branding</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              {isCompanyPortalAdmin
                ? 'Changes apply to how your company appears in the portal.'
                : 'Ask a portal admin to update how your company appears in the portal.'}
            </Text>
            <Form
              form={form}
              layout="vertical"
              style={{ maxWidth: 480 }}
              onFinish={onFinish}
              disabled={!isCompanyPortalAdmin}
              initialValues={{
                name: companyData.name,
                email: (companyData.email as string | null) || '',
                color: (companyData.color as string | null) || '#000000',
              }}
            >
              <Form.Item name="name" label="Company name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Company name" />
              </Form.Item>
              <Form.Item name="email" label="Company email">
                <Input type="email" placeholder="contact@company.com" />
              </Form.Item>
              <Form.Item name="color" label="Brand color">
                <ColorPickerInput />
              </Form.Item>
              {isCompanyPortalAdmin ? (
                <Form.Item>
                  <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                    Save changes
                  </Button>
                </Form.Item>
              ) : null}
            </Form>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
