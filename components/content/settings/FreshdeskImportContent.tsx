'use client'

import { CloudDownloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, Col, Divider, Flex, Form, Input, InputNumber, Layout, message, Row, Statistic, Switch, Typography } from 'antd'
import { useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

interface FreshdeskImportContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  initialDomain?: string
  initialApiKey?: string
}

type ImportResult = {
  companies: { imported: number; skipped: number; errors: number }
  contacts: { imported: number; skipped: number; errors: number }
  tickets: { imported: number; skipped: number; errors: number }
  comments: { imported: number; skipped: number; errors: number }
}

export default function FreshdeskImportContent({
  user,
  initialDomain = '',
  initialApiKey = '',
}: FreshdeskImportContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [settingsForm] = Form.useForm()
  const [savingSettings, setSavingSettings] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importContacts, setImportContacts] = useState(true)
  const [importTickets, setImportTickets] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [testLimit, setTestLimit] = useState(10)
  const [testTicketLimit, setTestTicketLimit] = useState(5)
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSaveSettings = async (values: { freshdesk_domain: string; freshdesk_api_key: string }) => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/freshdesk/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          freshdesk_domain: values.freshdesk_domain.trim(),
          freshdesk_api_key: values.freshdesk_api_key.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Failed to save settings')
      }
      message.success('Freshdesk settings saved')
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setLastResult(null)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/freshdesk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          import_contacts: importContacts,
          import_tickets: importTickets,
          ...(testMode ? { limit_companies: testLimit } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Import failed')
      setLastResult(data.result)
      if (data.firstTicketError) message.warning(`Ticket error sample: ${data.firstTicketError}`, 10)
      message.success('Import completed')
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Layout hasSider style={{ minHeight: '100dvh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: '32px 24px', maxWidth: 720 }}>
            <Title level={2} style={{ marginBottom: 4 }}>Freshdesk Import</Title>
            <Paragraph type="secondary" style={{ marginBottom: 32 }}>
              Import companies and contacts from your Freshdesk account into DeskTeam360.
              Existing records (matched by name or email) will be skipped.
            </Paragraph>

            {/* ── Settings Card ──────────────────────────── */}
            <Card title="Freshdesk API Settings" style={{ marginBottom: 24 }}>
              <Form
                form={settingsForm}
                layout="vertical"
                initialValues={{ freshdesk_domain: initialDomain, freshdesk_api_key: initialApiKey }}
                onFinish={handleSaveSettings}
              >
                <Form.Item
                  name="freshdesk_domain"
                  label="Freshdesk Domain"
                  rules={[{ required: true, message: 'Domain is required' }]}
                  extra="e.g. yourcompany.freshdesk.com"
                >
                  <Input placeholder="yourcompany.freshdesk.com" />
                </Form.Item>
                <Form.Item
                  name="freshdesk_api_key"
                  label="API Key"
                  rules={[{ required: true, message: 'API key is required' }]}
                  extra="Found in Freshdesk → Profile Settings → Your API Key"
                >
                  <Input.Password placeholder="Your Freshdesk API key" />
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingSettings}>
                  Save Settings
                </Button>
              </Form>
            </Card>

            {/* ── Import Card ──────────────────────────────── */}
            <Card title="Run Import">
              <Paragraph type="secondary">
                Select what to import. Make sure settings are saved before running.
              </Paragraph>
              <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                Companies are always imported. For each company, you can also import its contacts and tickets.
              </Paragraph>
              <Flex vertical gap={8} style={{ marginBottom: 20 }}>
                <Checkbox checked disabled>
                  <Text strong>Companies</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>Always imported (skipped if name already exists)</Text>
                </Checkbox>
                <Checkbox checked={importContacts} onChange={(e) => setImportContacts(e.target.checked)}>
                  <Text strong>Contacts</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>Imported per company as customer users</Text>
                </Checkbox>
                <Checkbox checked={importTickets} onChange={(e) => setImportTickets(e.target.checked)}>
                  <Text strong>Tickets & Comments</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>Imported per company, Freshdesk ticket IDs preserved</Text>
                </Checkbox>
              </Flex>

              <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
                <Switch checked={testMode} onChange={setTestMode} />
                <Text>Test mode</Text>
                {testMode && (
                  <>
                    <Text type="secondary">— limit</Text>
                    <InputNumber
                      min={1}
                      max={1000}
                      value={testLimit}
                      onChange={(v) => setTestLimit(v ?? 10)}
                      style={{ width: 80 }}
                    />
                    <Text type="secondary">records each</Text>
                  </>
                )}
              </Flex>

              <Button
                type="primary"
                icon={<CloudDownloadOutlined />}
                loading={importing}
                onClick={handleImport}
                size="large"
              >
                {importing ? 'Importing…' : testMode ? `Start Test Import (max ${testLimit})` : 'Start Import'}
              </Button>

              {errorMsg && (
                <Alert type="error" message={errorMsg} style={{ marginTop: 16 }} showIcon />
              )}

              {lastResult && (
                <>
                  <Divider />
                  <Title level={5}>Import Result</Title>
                  <Row gutter={[16, 16]}>
                    <Col xs={8}><Statistic title="Companies Imported" value={lastResult.companies.imported} valueStyle={{ color: '#52c41a' }} /></Col>
                    <Col xs={8}><Statistic title="Companies Skipped" value={lastResult.companies.skipped} valueStyle={{ color: '#8c8c8c' }} /></Col>
                    <Col xs={8}><Statistic title="Companies Failed" value={lastResult.companies.errors} valueStyle={{ color: lastResult.companies.errors > 0 ? '#ff4d4f' : undefined }} /></Col>
                    {importContacts && (
                      <>
                        <Col xs={8}><Statistic title="Contacts Imported" value={lastResult.contacts.imported} valueStyle={{ color: '#52c41a' }} /></Col>
                        <Col xs={8}><Statistic title="Contacts Skipped" value={lastResult.contacts.skipped} valueStyle={{ color: '#8c8c8c' }} /></Col>
                        <Col xs={8}><Statistic title="Contacts Failed" value={lastResult.contacts.errors} valueStyle={{ color: lastResult.contacts.errors > 0 ? '#ff4d4f' : undefined }} /></Col>
                      </>
                    )}
                    {importTickets && (
                      <>
                        <Col xs={8}><Statistic title="Tickets Imported" value={lastResult.tickets.imported} valueStyle={{ color: '#52c41a' }} /></Col>
                        <Col xs={8}><Statistic title="Tickets Skipped" value={lastResult.tickets.skipped} valueStyle={{ color: '#8c8c8c' }} /></Col>
                        <Col xs={8}><Statistic title="Tickets Failed" value={lastResult.tickets.errors} valueStyle={{ color: lastResult.tickets.errors > 0 ? '#ff4d4f' : undefined }} /></Col>
                        <Col xs={8}><Statistic title="Comments Imported" value={lastResult.comments.imported} valueStyle={{ color: '#52c41a' }} /></Col>
                        <Col xs={8}><Statistic title="Comments Skipped" value={lastResult.comments.skipped} valueStyle={{ color: '#8c8c8c' }} /></Col>
                        <Col xs={8}><Statistic title="Comments Failed" value={lastResult.comments.errors} valueStyle={{ color: lastResult.comments.errors > 0 ? '#ff4d4f' : undefined }} /></Col>
                      </>
                    )}
                  </Row>
                </>
              )}
            </Card>
          </Content>
      </AdminMainColumn>
    </Layout>
  )
}
