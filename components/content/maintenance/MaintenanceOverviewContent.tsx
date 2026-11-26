'use client'

import { Button, Layout, message, Segmented, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

type Row = {
  website_id: string
  company_id: string
  company: string
  url: string
  state: 'due' | 'never' | 'draft' | 'ok'
  cycle_days: number
  last_report: { id: string; name: string; date: string; age_days: number | null } | null
  draft_report: { id: string; name: string; date: string } | null
  last_crawl_at: string | null
  last_crawl_age_days: number | null
  schedule: { next_run_at: string | null; template_key: string | null } | null
}

const STATE: Record<Row['state'], { color: string; label: string }> = {
  due: { color: 'red', label: 'Due' },
  never: { color: 'orange', label: 'No report yet' },
  draft: { color: 'blue', label: 'Draft waiting' },
  ok: { color: 'green', label: 'Up to date' },
}

/** Every website in one list: what was last reported, how old its crawl is, and what is due. */
export default function MaintenanceOverviewContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'attention' | 'all'>('attention')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/maintenance-overview', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || res.statusText)
      setRows(j.data ?? [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not load the overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => (filter === 'all' ? rows : rows.filter((r) => r.state !== 'ok')), [rows, filter])
  const counts = useMemo(() => ({ due: rows.filter((r) => r.state === 'due' || r.state === 'never').length, draft: rows.filter((r) => r.state === 'draft').length }), [rows])

  const columns: ColumnsType<Row> = [
    {
      title: 'Website',
      render: (_: unknown, r) => (
        <div>
          <a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a>
          <div><Link href={`/settings/companies/${r.company_id}`}>{r.company}</Link></div>
        </div>
      ),
    },
    { title: 'Status', width: 150, render: (_: unknown, r) => <Tag color={STATE[r.state].color}>{STATE[r.state].label}</Tag> },
    {
      title: 'Last report',
      render: (_: unknown, r) =>
        r.last_report ? (
          <div>
            <Link href={`/maintenance-reports/${r.last_report.id}`}>{r.last_report.name}</Link>
            <div><Text type="secondary">{r.last_report.date} ({r.last_report.age_days} days ago, every {r.cycle_days})</Text></div>
          </div>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Last crawl',
      render: (_: unknown, r) => (r.last_crawl_at ? <span>{r.last_crawl_age_days === 0 ? 'Today' : `${r.last_crawl_age_days} days ago`}</span> : <Tag>No crawl</Tag>),
    },
    {
      title: 'Schedule',
      render: (_: unknown, r) =>
        r.schedule ? (
          <div>
            {r.schedule.next_run_at ? <DateDisplay date={r.schedule.next_run_at} /> : '-'}
            <div><Text type="secondary">{r.schedule.template_key ? `then a ${r.schedule.template_key} draft` : 'crawl only'}</Text></div>
          </div>
        ) : (
          <Text type="secondary">Not scheduled</Text>
        ),
    },
    {
      title: '',
      width: 140,
      render: (_: unknown, r) =>
        r.draft_report ? (
          <Button type="primary" size="small" onClick={() => router.push(`/maintenance-reports/${r.draft_report!.id}`)}>Open draft</Button>
        ) : (
          <Button size="small" onClick={() => router.push(`/settings/companies/${r.company_id}`)}>Company</Button>
        ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 1300 }}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Title level={2} style={{ margin: 0 }}>Website maintenance</Title>
              <Text type="secondary">{counts.due} due or without a report, {counts.draft} draft(s) waiting for a person. Start a report from a website in its company, under Websites.</Text>
            </div>
            <Segmented
              value={filter}
              onChange={(v) => setFilter(v as 'attention' | 'all')}
              options={[{ value: 'attention', label: 'Needs attention' }, { value: 'all', label: `All websites (${rows.length})` }]}
            />
            <Table rowKey="website_id" size="middle" loading={loading} dataSource={shown} columns={columns} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
