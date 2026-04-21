'use client'

import { ArrowLeftOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Form,
  InputNumber,
  Layout,
  message,
  Modal,
  Select,
  Space,
  Typography,
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'
import TabCompanyLog from '../CompanyDetail/TabCompanyLog'
import { SpaNavLink } from '../SpaNavLink'

const { Content } = Layout
const { Title, Text } = Typography

type CompanyRow = { id: string; name: string }

type UserOption = { id: string; full_name: string | null; email: string; role: string }
type TeamOption = { id: string; name: string }

interface CompanyLogSettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function CompanyLogSettingsContent({ user: currentUser }: CompanyLogSettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [logNonce, setLogNonce] = useState(0)

  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addForm] = Form.useForm<{
    company_id: string
    snapshot_date: Dayjs
    active_team_id?: string | null
    active_manager_id?: string | null
    active_time: number
  }>()
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [managerOptions, setManagerOptions] = useState<UserOption[]>([])

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true)
    try {
      const res = await fetch('/api/companies', { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      const rows = Array.isArray(body.data) ? body.data : []
      setCompanies(rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })))
    } catch {
      setCompanies([])
    } finally {
      setLoadingCompanies(false)
    }
  }, [])

  const loadTeamsUsers = useCallback(async () => {
    try {
      const [usersRes, teamsRes] = await Promise.all([
        fetch('/api/users', { credentials: 'include' }),
        fetch('/api/teams', { credentials: 'include' }),
      ])
      const usersBody = await usersRes.json().catch(() => [])
      const teamsBody = await teamsRes.json().catch(() => [])
      if (usersRes.ok && Array.isArray(usersBody)) {
        setManagerOptions(
          (usersBody as UserOption[]).filter((u) => (u.role || '').toLowerCase() !== 'customer' && !!u.email),
        )
      } else {
        setManagerOptions([])
      }
      if (teamsRes.ok && Array.isArray(teamsBody)) {
        setTeamOptions((teamsBody as TeamOption[]).map((t) => ({ id: t.id, name: t.name })))
      } else {
        setTeamOptions([])
      }
    } catch {
      setManagerOptions([])
      setTeamOptions([])
    }
  }, [])

  useEffect(() => {
    void loadCompanies()
  }, [loadCompanies])

  const openAddFromSettings = async () => {
    await loadTeamsUsers()
    addForm.resetFields()
    addForm.setFieldsValue({
      company_id: companyId ?? undefined,
      snapshot_date: dayjs().startOf('day'),
      active_team_id: undefined,
      active_manager_id: undefined,
      active_time: 0,
    })
    setAddOpen(true)
  }

  const submitAddFromSettings = async () => {
    try {
      const v = await addForm.validateFields()
      const cid = v.company_id
      setAddSaving(true)
      const res = await fetch(`/api/companies/${cid}/daily-active-assignments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot_date: v.snapshot_date.format('YYYY-MM-DD'),
          active_team_id: v.active_team_id ?? null,
          active_manager_id: v.active_manager_id ?? null,
          active_time: v.active_time ?? 0,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText || 'Save failed')
      message.success('Company Log entry created')
      setAddOpen(false)
      setCompanyId(cid)
      setLogNonce((n) => n + 1)
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setAddSaving(false)
    }
  }

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
        <Content
          className="settings-page company-log-settings-page"
          style={{
            padding: 24,
            width: '100%',
            maxWidth: '100%',
            minHeight: '100vh',
            boxSizing: 'border-box',
            background: 'var(--layout-bg)',
          }}
        >
          <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: '100%' }}>
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
              <SpaNavLink href="/settings" style={{ fontSize: 14 }}>
                <ArrowLeftOutlined /> Back to Settings
              </SpaNavLink>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void openAddFromSettings()}>
                Add log entry
              </Button>
            </Space>
            <div>
              <Space align="center">
                <FileTextOutlined style={{ fontSize: 28, color: '#1677ff' }} />
                <div>
                  <Title level={2} className="settings-section-heading" style={{ margin: 0 }}>
                    Company Log
                  </Title>
                  {/* <Text type="secondary">
                    Table company_daily_active_assignments — choose a company to filter the table, or use &quot;Add log
                    entry&quot; to create a row for any company.
                  </Text> */}
                </div>
              </Space>
            </div>

            <Card size="small" loading={loadingCompanies}>
              <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                <Text strong>Filter by company (optional for viewing)</Text>
                <Select
                  showSearch
                  allowClear
                  placeholder="Select company to show log table"
                  optionFilterProp="label"
                  style={{ width: '100%', maxWidth: '100%' }}
                  loading={loadingCompanies}
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  value={companyId ?? undefined}
                  onChange={(v) => setCompanyId(v ?? null)}
                />
              </Space>
            </Card>

            {companyId ? (
              <TabCompanyLog
                key={`${companyId}-${logNonce}`}
                companyId={companyId}
                forceCanManage
                layout="full"
              />
            ) : (
              <Card size="small">
                <Text type="secondary">
                  Select a company to load the log table here, or click <Text strong>Add log entry</Text> above to
                  create data without choosing a filter first.
                </Text>
              </Card>
            )}

            <Modal
              title="Add Company Log entry"
              open={addOpen}
              onOk={() => void submitAddFromSettings()}
              onCancel={() => setAddOpen(false)}
              confirmLoading={addSaving}
              destroyOnHidden
              width={520}
            >
              <Form form={addForm} layout="vertical" requiredMark={false}>
                <Form.Item name="company_id" label="Company" rules={[{ required: true, message: 'Required' }]}>
                  <Select
                    showSearch
                    placeholder="Company"
                    optionFilterProp="label"
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Form.Item>
                <Form.Item
                  name="snapshot_date"
                  label="snapshot_date (UTC)"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="active_team_id" label="active_team_id">
                  <Select
                    allowClear
                    showSearch
                    placeholder="Team"
                    optionFilterProp="label"
                    options={teamOptions.map((t) => ({ value: t.id, label: t.name }))}
                  />
                </Form.Item>
                <Form.Item name="active_manager_id" label="active_manager_id">
                  <Select
                    allowClear
                    showSearch
                    placeholder="Non-customer user"
                    optionFilterProp="label"
                    options={managerOptions.map((u) => ({
                      value: u.id,
                      label: `${u.full_name || u.email} (${u.email})`,
                    }))}
                  />
                </Form.Item>
                <Form.Item name="active_time" label="active_time" initialValue={0}>
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} addonAfter="H" />
                </Form.Item>
              </Form>
            </Modal>
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
