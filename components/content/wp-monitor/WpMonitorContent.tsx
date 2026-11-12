'use client'

import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Drawer, Empty, Flex, Layout, message, Popconfirm, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import WpKeySetupModal from '@/components/wp-monitor/WpKeySetupModal'
import WpSiteDetails, { HEALTH_COLOR, HEALTH_LABEL } from '@/components/wp-monitor/WpSiteDetails'
import type { WpFacts, WpHealthLevel } from '@/lib/wp-health'
import type { WpPoint } from '@/lib/wp-series'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography

type Site = {
  id: string
  site_url: string
  name: string | null
  company_id: string | null
  company_name: string | null
  health: WpHealthLevel
  problems: { code: string; level: string; text: string }[]
  facts: WpFacts
  uptime: { ok: boolean | null; status: number | null; ms: number | null; checked_at: string | null; down_since: string | null }
  snoozed_until: string | null
  last_seen_at: string | null
}

const SNOOZE_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 4, label: '4 hours' },
  { value: 24, label: '1 day' },
  { value: 168, label: '1 week' },
]

type SessionUser = { id: string; email?: string | null; name?: string | null; role?: string | null }

function Trend({ title, data, dataKey, note }: { title: string; data: { at: string; v: number | null }[]; dataKey?: string; note?: string }) {
  const rows = data.filter((d) => d.v !== null).map((d) => ({ day: dayjs(d.at).format('MMM D'), [dataKey ?? 'v']: d.v }))
  return (
    <Card size="small" title={title}>
      {rows.length < 2 ? (
        <Text type="secondary">{data.length > 0 && !data.some((d) => d.v !== null) ? (note ?? 'This site does not report this.') : 'Not enough reports yet.'}</Text>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
            <ChartTooltip />
            <Line type="monotone" dataKey={dataKey ?? 'v'} stroke="#1677ff" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

/** All monitored WordPress sites in one table, the ones that need action first; click a site for its details, trends and actions. */
export default function WpMonitorContent({ user }: { user: SessionUser }) {
  const [collapsed, setCollapsed] = useState(false)
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Site | null>(null)
  const [points, setPoints] = useState<WpPoint[]>([])
  const [rotated, setRotated] = useState<{ label: string; key: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const isAdminUser = (user.role ?? '').toLowerCase() === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/wp-monitor/overview', { credentials: 'include' })
      const j = (await res.json()) as { sites?: Site[]; error?: string }
      if (!res.ok) throw new Error(j.error || 'Could not load the sites')
      setSites(j.sites ?? [])
      setOpen((cur) => (cur ? ((j.sites ?? []).find((s) => s.id === cur.id) ?? null) : null))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 60000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    setPoints([])
    void fetch(`/api/wp-monitor/sites/${open.id}/history?days=30`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((j: { points: WpPoint[] }) => setPoints(j.points))
  }, [open?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const snooze = async (site: Site, hours: number) => {
    const res = await fetch(`/api/wp-monitor/sites/${site.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snooze_hours: hours }) })
    if (!res.ok) return void message.error('Could not change the snooze')
    message.success(hours === 0 ? 'Alarms are on again' : `Alarms for ${site.name || site.site_url} are quiet for ${SNOOZE_OPTIONS.find((o) => o.value === hours)?.label}`)
    void load()
  }

  const rotate = async (site: Site) => {
    const res = await fetch(`/api/wp-monitor/sites/${site.id}/rotate`, { method: 'POST', credentials: 'include' })
    const j = (await res.json().catch(() => ({}))) as { secret_key?: string; error?: string }
    if (!res.ok || !j.secret_key) return void message.error(j.error || 'Could not make a new key')
    setRotated({ label: site.name || site.site_url, key: j.secret_key })
  }

  /** Looks at the site now: opens it, asks the plugin for a fresh report, updates the alarms. */
  const checkNow = async (site: Site) => {
    setChecking(true)
    try {
      const res = await fetch(`/api/wp-monitor/sites/${site.id}/check`, { method: 'POST', credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { uptime_ok?: boolean; report?: string; report_note?: string | null; error?: string }
      if (!res.ok) throw new Error(j.error || 'The check failed')
      const note = j.report === 'fresh' ? 'fresh report received' : `kept the last report (${j.report_note ?? 'no answer'})`
      message[j.uptime_ok ? 'success' : 'warning'](`${j.uptime_ok ? 'The site answers' : 'The site does not answer'}; ${note}`, 6)
      void load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const remove = async (site: Site) => {
    const res = await fetch(`/api/wp-monitor/sites/${site.id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return void message.error('Could not remove the site')
    message.success('Site removed')
    setOpen(null)
    void load()
  }

  const counts = { red: sites.filter((s) => s.health === 'red').length, yellow: sites.filter((s) => s.health === 'yellow').length, green: sites.filter((s) => s.health === 'green').length }
  const isSnoozed = (s: Site) => !!s.snoozed_until && new Date(s.snoozed_until) > new Date()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back to Settings</Button>
              </SpaNavLink>
              <Flex justify="space-between" align="center" wrap gap={12}>
                <div>
                  <Title level={2} style={{ margin: '8px 0 0' }}>WordPress monitoring</Title>
                  <Text type="secondary">Sites report every hour. This server also opens each site every few minutes. Add a site from Company, Websites.</Text>
                </div>
                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Refresh</Button>
              </Flex>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={8}><Card size="small"><Statistic title="Need action" value={counts.red} styles={{ content: { color: counts.red ? '#cf1322' : undefined } }} /></Card></Col>
              <Col xs={8}><Card size="small"><Statistic title="Check" value={counts.yellow} styles={{ content: { color: counts.yellow ? '#d48806' : undefined } }} /></Card></Col>
              <Col xs={8}><Card size="small"><Statistic title="Healthy" value={counts.green} styles={{ content: { color: '#389e0d' } }} /></Card></Col>
            </Row>

            <Table<Site>
              rowKey="id"
              size="middle"
              loading={loading && sites.length === 0}
              dataSource={sites}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty description="No site registered yet. Open a company, Websites, and press Monitor WordPress." /> }}
              onRow={(r) => ({ onClick: () => setOpen(r), style: { cursor: 'pointer' } })}
              columns={[
                {
                  title: 'Status',
                  width: 130,
                  render: (_: unknown, r) => (
                    <Space size={4} orientation="vertical">
                      <Tag color={HEALTH_COLOR[r.health]} style={{ margin: 0 }}>{HEALTH_LABEL[r.health]}</Tag>
                      {isSnoozed(r) ? <Tag style={{ margin: 0 }}>Snoozed</Tag> : null}
                    </Space>
                  ),
                },
                {
                  title: 'Site',
                  render: (_: unknown, r) => (
                    <div>
                      <Text strong>{r.name || r.site_url}</Text>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{r.company_name ?? 'No company'} · {r.site_url.replace(/^https?:\/\//, '')}</Text></div>
                    </div>
                  ),
                },
                { title: 'WP / PHP', width: 130, render: (_: unknown, r) => `${r.facts.wp_version ?? '?'} / ${r.facts.php_version ?? '?'}` },
                {
                  title: 'Updates',
                  width: 140,
                  render: (_: unknown, r) => (r.facts.core_update_available || r.facts.plugin_updates || r.facts.theme_updates ? `${r.facts.core_update_available ? 'core + ' : ''}${r.facts.plugin_updates} plugins, ${r.facts.theme_updates} themes` : '—'),
                },
                { title: 'SSL', width: 90, render: (_: unknown, r) => (r.facts.ssl.expired ? <Tag color="red">Expired</Tag> : r.facts.ssl.days_left !== null ? `${r.facts.ssl.days_left} d` : '—') },
                {
                  title: 'Backup',
                  width: 130,
                  render: (_: unknown, r) => (!r.facts.backup.installed ? <Text type="secondary">none</Text> : r.facts.backup.last_time ? `${dayjs(r.facts.backup.last_time).fromNow()}${r.facts.backup.last_success === false ? ' (failed)' : ''}` : 'never'),
                },
                { title: 'Failed logins 24h', width: 120, render: (_: unknown, r) => r.facts.failed_logins_24h ?? '—' },
                { title: 'Wordfence', width: 100, render: (_: unknown, r) => (r.facts.wordfence.active ? r.facts.wordfence.open_issues ?? '—' : '—') },
                {
                  title: 'Up?',
                  width: 110,
                  render: (_: unknown, r) =>
                    r.uptime.ok === null ? <Text type="secondary">not checked</Text> : r.uptime.ok ? <Text type="success">{r.uptime.ms} ms</Text> : <Tag color="red">{r.uptime.status ? `HTTP ${r.uptime.status}` : 'no answer'}</Tag>,
                },
                {
                  title: 'Last report',
                  width: 130,
                  render: (_: unknown, r) => (r.last_seen_at ? <Tooltip title={dayjs(r.last_seen_at).format('MMM D, YYYY HH:mm')}>{dayjs(r.last_seen_at).fromNow()}</Tooltip> : 'never'),
                },
              ]}
            />
          </Space>
        </Content>
      </AdminMainColumn>

      <Drawer open={open !== null} onClose={() => setOpen(null)} size="large" title={open ? (open.name || open.site_url) : ''} destroyOnHidden>
        {open ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Flex gap={8} wrap align="center">
              <Tag color={HEALTH_COLOR[open.health]} style={{ margin: 0 }}>{HEALTH_LABEL[open.health]}</Tag>
              <a href={open.site_url} target="_blank" rel="noopener noreferrer">{open.site_url}</a>
              <a href={`${open.site_url}/wp-admin/update-core.php`} target="_blank" rel="noopener noreferrer">Open updates in wp-admin</a>
              <Button size="small" loading={checking} onClick={() => void checkNow(open)}>Check now</Button>
            </Flex>

            {isSnoozed(open) ? <Alert type="info" showIcon title={`Alarms are quiet until ${dayjs(open.snoozed_until).format('MMM D, HH:mm')}`} action={<Button size="small" onClick={() => void snooze(open, 0)}>Turn alarms on</Button>} /> : (
              <Flex gap={8} align="center" wrap>
                <Text type="secondary">Planned maintenance? Quiet the alarms for</Text>
                <Select placeholder="Choose" style={{ width: 130 }} options={SNOOZE_OPTIONS} onChange={(h) => void snooze(open, h)} />
              </Flex>
            )}

            <WpSiteDetails wp={{ site_url: open.site_url, facts: open.facts, problems: open.problems }} />

            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}><Trend title="Plugin updates pending" data={points.map((p) => ({ at: p.at, v: p.plugin_updates }))} /></Col>
              <Col xs={24} md={12}><Trend title="Failed logins (24h)" note="Not reported: failed logins need Wordfence on the site." data={points.map((p) => ({ at: p.at, v: p.failed_logins }))} /></Col>
              <Col xs={24} md={12}><Trend title="SSL days left" data={points.map((p) => ({ at: p.at, v: p.ssl_days_left }))} /></Col>
              <Col xs={24} md={12}><Trend title="Spam comments (total)" data={points.map((p) => ({ at: p.at, v: p.spam }))} /></Col>
            </Row>

            {isAdminUser ? (
              <Flex gap={8} wrap>
                <Popconfirm title="Make a new key?" description="The old key stops working at once. The new one goes into the site's wp-config.php." okText="New key" onConfirm={() => void rotate(open)}>
                  <Button>New key</Button>
                </Popconfirm>
                <Popconfirm title="Stop monitoring this site?" description="Its reports and alarms are removed." okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => void remove(open)}>
                  <Button danger>Remove site</Button>
                </Popconfirm>
              </Flex>
            ) : null}
          </Space>
        ) : null}
      </Drawer>

      <WpKeySetupModal open={rotated !== null} onClose={() => setRotated(null)} siteLabel={rotated?.label ?? ''} secretKey={rotated?.key ?? ''} rotated />
    </Layout>
  )
}
