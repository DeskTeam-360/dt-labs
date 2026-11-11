'use client'

import { DeleteOutlined, EditOutlined, EyeOutlined,GlobalOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, message, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd'
import { Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import WpKeySetupModal from '@/components/wp-monitor/WpKeySetupModal'
import WpSiteDetails, { HEALTH_COLOR, HEALTH_LABEL, type WpSiteSummary } from '@/components/wp-monitor/WpSiteDetails'

const { Text } = Typography


interface TabWebsitesProps {
  websites: any[]
  loadingWebsites: boolean
  getLastCrawlSession: (websiteId: string) => any
  onAddWebsite: () => void
  onEditWebsite: (record: any) => void
  onDeleteWebsite: (id: string) => void
  /** Called after something changed here (a site was registered for monitoring), so the list can reload. */
  onChanged?: () => void
}

export default function TabWebsites({
  websites,
  loadingWebsites,
  getLastCrawlSession,
  onAddWebsite,
  onEditWebsite,
  onDeleteWebsite,
  onChanged,
}: TabWebsitesProps) {
  const router = useRouter()
  const isAdminUser = ((useSession().data?.user as { role?: string } | undefined)?.role ?? '').toLowerCase() === 'admin'
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ label: string; key: string } | null>(null)

  /** Registers the website for monitoring and shows its key once, with what to put in the site's wp-config.php. */
  const registerForMonitoring = async (record: any) => {
    setRegisteringId(record.id)
    try {
      const res = await fetch('/api/wp-monitor/sites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_url: record.url, name: record.title || undefined, company_id: record.company_id }),
      })
      const j = (await res.json().catch(() => ({}))) as { secret_key?: string; error?: string }
      if (!res.ok || !j.secret_key) throw new Error(j.error || 'Could not register the site')
      setSetup({ label: record.title || record.url, key: j.secret_key })
      onChanged?.()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setRegisteringId(null)
    }
  }

  const columns: ColumnsType<any> = [
    {
      title: 'Primary',
      dataIndex: 'is_primary',
      key: 'is_primary',
      render: (isPrimary: boolean) => (
        <Tag color={isPrimary ? 'blue' : 'default'}>
          {isPrimary ? 'Primary' : '-'}
        </Tag>
      ),
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ),
      ellipsis: true,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string | null) => title || '-',
    },
    {
      title: 'WordPress',
      key: 'wordpress',
      render: (_: unknown, record: any) => {
        const wp = record.wp_site as WpSiteSummary | null
        if (!wp) return <Text type="secondary">Not monitored</Text>
        const f = wp.facts
        return (
          <Tooltip title={wp.problems.length ? wp.problems.map((p) => p.text).join(' · ') : 'Nothing needs attention'}>
            <Space size={6} wrap>
              <Tag color={HEALTH_COLOR[wp.health]} style={{ margin: 0 }}>{HEALTH_LABEL[wp.health]}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>WP {f.wp_version ?? '?'} · PHP {f.php_version ?? '?'}</Text>
            </Space>
          </Tooltip>
        )
      },
    },
    {
      title: 'Created At',
      key: 'created_at',
      render: (_: unknown, record: any) => <DateDisplay date={record.created_at} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: any) => {
        const lastCrawlSession = getLastCrawlSession(record.id)
        return (
          <Space>
            {isAdminUser && !record.wp_site ? (
              <Tooltip title="Watch this site with the DeskTeam360 Monitor plugin">
                <Button type="link" loading={registeringId === record.id} onClick={() => void registerForMonitoring(record)}>
                  Monitor WordPress
                </Button>
              </Tooltip>
            ) : null}
            {lastCrawlSession && (
              <Button
                type="link"
                icon={<EyeOutlined />}
                onClick={() => router.push(`/crawl-sessions/${lastCrawlSession.id}`)}
              >
                Last Crawl
              </Button>
            )}
            <Button type="link" icon={<EditOutlined />} onClick={() => onEditWebsite(record)}>
              Edit
            </Button>
            <Popconfirm
              title="Delete website"
              description="Are you sure you want to delete this website?"
              onConfirm={() => onDeleteWebsite(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddWebsite} size="large">
          Add Website
        </Button>
        <Text type="secondary">Manage company websites</Text>
      </Space>

      {loadingWebsites ? (
        <Spin />
      ) : websites.length > 0 ? (
        <Table
          dataSource={websites}
          rowKey="id"
          columns={columns}
          pagination={false}
          expandable={{
            rowExpandable: (record: any) => !!record.wp_site,
            expandedRowRender: (record: any) => <WpSiteDetails wp={record.wp_site as WpSiteSummary} />,
          }}
        />
      ) : (
        <Card>
          <Space orientation="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
            <GlobalOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
            <Text type="secondary">No websites added yet</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddWebsite}>
              Add First Website
            </Button>
          </Space>
        </Card>
      )}
      <WpKeySetupModal open={setup !== null} onClose={() => setSetup(null)} siteLabel={setup?.label ?? ''} secretKey={setup?.key ?? ''} />
    </div>
  )
}
