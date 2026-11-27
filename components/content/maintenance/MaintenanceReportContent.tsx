'use client'

import { ArrowLeftOutlined, CheckCircleOutlined, CopyOutlined, DeleteOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Input, Layout, message, Select, Space, Spin, Tag, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import LinkedNote from '@/components/content/maintenance/LinkedNote'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { NEED_CHECK } from '@/lib/maintenance-sources'

const { Content } = Layout
const { Title, Text } = Typography

type Item = {
  id: string
  section: string
  label: string
  options: string[]
  source: string | null
  status: string | null
  note: string
  link_url: string
  checked_on: string | null
  auto_filled: boolean
  edited: boolean
}
type Report = { id: string; website_id: string; template_name: string; template_key: string; period_date: string; status: string; conclusion: string; share_token: string | null; crawl_session_id: string | null }
type Crawl = { id: string; created_at: string; total_pages: number; broken_pages: number }
type Header = { company_name: string; website_url: string; website_title: string; wp_version: string | null; php_version: string | null; developer: string | null }

const NA = 'N/A'
export default function MaintenanceReportContent({ reportId, user }: { reportId: string; user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [header, setHeader] = useState<Header | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [crawls, setCrawls] = useState<Crawl[]>([])
  const [conclusion, setConclusion] = useState('')
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [conclusionDirty, setConclusionDirty] = useState(false)
  const [newItem, setNewItem] = useState<Record<string, string>>({})

  const apply = useCallback((body: { report: Report; header: Header; items: Item[]; crawls: Crawl[] }) => {
    setReport(body.report)
    setCrawls(body.crawls ?? [])
    setHeader(body.header)
    setItems(body.items)
    setConclusion(body.report.conclusion)
    setDirty(new Set())
    setConclusionDirty(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/maintenance-reports/${reportId}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      apply(body)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not load the report')
    } finally {
      setLoading(false)
    }
  }, [reportId, apply])

  useEffect(() => {
    void load()
  }, [load])

  const sections = useMemo(() => {
    const out: { name: string; items: Item[] }[] = []
    for (const i of items) {
      const last = out[out.length - 1]
      if (last && last.name === i.section) last.items.push(i)
      else out.push({ name: i.section, items: [i] })
    }
    return out
  }, [items])

  const change = (id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    setDirty((prev) => new Set(prev).add(id))
  }

  const patch = async (payload: Record<string, unknown>, okText?: string) => {
    const res = await fetch(`/api/maintenance-reports/${reportId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error || res.statusText)
    if (body.report) apply(body)
    if (okText) message.success(okText)
  }

  const save = async (extra: Record<string, unknown> = {}, okText = 'Saved') => {
    setSaving(true)
    try {
      const changed = items.filter((i) => dirty.has(i.id)).map((i) => ({ id: i.id, status: i.status ?? '', note: i.note, link_url: i.link_url }))
      await patch({ ...(changed.length ? { items: changed } : {}), ...(conclusionDirty ? { conclusion } : {}), ...extra }, okText)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const addItem = async (section: string) => {
    const label = (newItem[section] ?? '').trim()
    if (!label) return
    await save({ add_item: { section, label } }, 'Item added')
    setNewItem((prev) => ({ ...prev, [section]: '' }))
  }

  const refreshAuto = async () => {
    setRefreshing(true)
    try {
      // Save what was typed first, so the refresh keeps those items.
      await save({ action: 'refresh' }, 'Automatic checks updated')
    } finally {
      setRefreshing(false)
    }
  }

  const isFinal = report?.status === 'final'
  const shareUrl = report?.share_token && typeof window !== 'undefined' ? `${window.location.origin}/report/${report.share_token}` : ''
  const copyShare = () => navigator.clipboard.writeText(shareUrl).then(() => message.success('Link copied'), () => message.error('Could not copy the link'))
  const hasChanges = dirty.size > 0 || conclusionDirty

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 1200 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }} onClick={() => router.back()}>
                Back
              </Button>
              <Title level={2} style={{ margin: '8px 0 0' }}>
                {report?.template_name ?? 'Website maintenance report'}
              </Title>
            </div>

            {loading ? (
              <Spin />
            ) : !report || !header ? (
              <Alert type="error" showIcon title="Report not found" />
            ) : (
              <>
                <Card size="small">
                  <Descriptions size="small" column={{ xs: 1, md: 2 }}>
                    <Descriptions.Item label="Customer">{header.company_name}</Descriptions.Item>
                    <Descriptions.Item label="Maintenance date">{report.period_date}</Descriptions.Item>
                    <Descriptions.Item label="Website">
                      <a href={header.website_url} target="_blank" rel="noopener noreferrer">
                        {header.website_url}
                      </a>
                    </Descriptions.Item>
                    <Descriptions.Item label="Developer">{header.developer ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="WordPress version">{header.wp_version ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="PHP version">{header.php_version ?? '—'}</Descriptions.Item>
                  </Descriptions>
                  <Space wrap style={{ marginTop: 12 }}>
                    <Text type="secondary">Crawl:</Text>
                    <Select
                      style={{ minWidth: 280 }}
                      disabled={isFinal}
                      value={report.crawl_session_id ?? undefined}
                      placeholder="Latest crawl"
                      options={crawls.map((c) => ({ value: c.id, label: `${new Date(c.created_at).toLocaleString()} · ${c.total_pages} pages · ${c.broken_pages} broken` }))}
                      onChange={(v) => void save({ crawl_session_id: v }, 'Crawl changed, automatic checks updated')}
                    />
                  </Space>
                  <Space wrap style={{ marginTop: 12 }}>
                    <Tag color={isFinal ? 'green' : 'default'}>{isFinal ? 'Final' : 'Draft'}</Tag>
                    <Button icon={<ReloadOutlined />} loading={refreshing} disabled={isFinal} onClick={() => void refreshAuto()}>
                      Run automatic checks again
                    </Button>
                    <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!hasChanges} onClick={() => void save()}>
                      Save
                    </Button>
                    {isFinal ? (
                      <Button onClick={() => void save({ status: 'draft' }, 'Reopened as draft')}>Reopen</Button>
                    ) : (
                      <Button icon={<CheckCircleOutlined />} loading={saving} onClick={() => void save({ status: 'final' }, 'Report finalized')}>
                        Mark as final
                      </Button>
                    )}
                  </Space>
                  {isFinal ? (
                    <Space wrap style={{ marginTop: 12 }}>
                      {shareUrl ? (
                        <>
                          <Input readOnly value={shareUrl} style={{ width: 420, maxWidth: '100%' }} prefix={<LinkOutlined />} />
                          <Button icon={<CopyOutlined />} onClick={() => void copyShare()}>Copy link</Button>
                          <Button loading={saving} onClick={() => void save({ action: 'share' }, 'New link made, the old one no longer works')}>New link</Button>
                          <Button danger loading={saving} onClick={() => void save({ action: 'unshare' }, 'Sharing stopped')}>Stop sharing</Button>
                        </>
                      ) : (
                        <Button icon={<LinkOutlined />} loading={saving} onClick={() => void save({ action: 'share' }, 'Link created')}>Create share link for the customer</Button>
                      )}
                    </Space>
                  ) : null}
                </Card>

                {sections.map((sec, si) => (
                  <Card key={sec.name} size="small" title={`${String.fromCharCode(65 + si)}. ${sec.name}`} styles={{ body: { padding: 0 } }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--ant-color-fill-quaternary, #fafafa)', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px', width: 40 }}>No</th>
                            <th style={{ padding: '8px 12px' }}>Item</th>
                            <th style={{ padding: '8px 12px', width: 110 }}>Date</th>
                            <th style={{ padding: '8px 12px', width: 260 }}>Status</th>
                            <th style={{ padding: '8px 12px', width: 340 }}>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.items.map((it, n) => {
                            const good = it.status !== null && it.status === it.options[0]
                            const needCheck = it.status === NEED_CHECK
                            const problem = needCheck || (it.status !== null && it.status !== NA && !good && it.options.length > 1 && it.options.slice(1).includes(it.status))
                            return (
                              <tr key={it.id} style={{ borderTop: '1px solid var(--ant-color-border-secondary, #f0f0f0)', verticalAlign: 'top' }}>
                                <td style={{ padding: '8px 12px' }}>{n + 1}</td>
                                <td style={{ padding: '8px 12px' }}>
                                  {it.label}
                                  {!isFinal ? (
                                    <Button type="text" size="small" danger icon={<DeleteOutlined />} title="Remove this item from the report" style={{ marginLeft: 4 }} onClick={() => void save({ delete_item: it.id }, 'Item removed')} />
                                  ) : null}
                                  {it.source ? (
                                    <Tag style={{ marginLeft: 8 }} color={it.auto_filled && !it.edited ? 'blue' : 'default'}>
                                      {it.auto_filled && !it.edited ? 'auto' : it.edited ? 'edited' : 'no data'}
                                    </Tag>
                                  ) : null}
                                </td>
                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{it.checked_on ?? '—'}</td>
                                <td style={{ padding: '8px 12px' }}>
                                  <Select
                                    style={{ width: '100%' }}
                                    allowClear
                                    placeholder="Choose"
                                    disabled={isFinal}
                                    status={problem ? 'warning' : undefined}
                                    value={it.status ?? undefined}
                                    options={[...it.options, ...(it.source ? [NEED_CHECK] : []), NA].map((o) => ({ value: o, label: o }))}
                                    onChange={(v) => change(it.id, { status: v ?? null })}
                                  />
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {isFinal ? (
                                    <LinkedNote text={[it.note, it.link_url && !it.note.includes(it.link_url) ? it.link_url : ''].filter(Boolean).join('\n')} fallbackLabel={it.source?.startsWith('shot_home') ? 'Homepage' : undefined} />
                                  ) : (
                                    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                                      <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} value={it.note} onChange={(e) => change(it.id, { note: e.target.value })} placeholder="Note" />
                                      {it.link_url ? <LinkedNote text={it.link_url} fallbackLabel={it.source?.startsWith('shot_home') ? 'Homepage' : 'Open link'} /> : null}
                                    </Space>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!isFinal ? (
                      <Space.Compact style={{ width: '100%', padding: 12 }}>
                        <Input placeholder="Add an item to this section (only for this report)" value={newItem[sec.name] ?? ''} onChange={(e) => setNewItem((prev) => ({ ...prev, [sec.name]: e.target.value }))} onPressEnter={() => void addItem(sec.name)} />
                        <Button icon={<PlusOutlined />} loading={saving} onClick={() => void addItem(sec.name)}>Add</Button>
                      </Space.Compact>
                    ) : null}
                  </Card>
                ))}

                <Card size="small" title="Comments from developer">
                  {isFinal ? (
                    <Text style={{ whiteSpace: 'pre-wrap' }}>{conclusion || '—'}</Text>
                  ) : (
                    <Input.TextArea
                      autoSize={{ minRows: 4, maxRows: 14 }}
                      value={conclusion}
                      onChange={(e) => {
                        setConclusion(e.target.value)
                        setConclusionDirty(true)
                      }}
                      placeholder="Conclusion for the customer"
                    />
                  )}
                </Card>
              </>
            )}
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
