'use client'

import { ReadOutlined } from '@ant-design/icons'
import { Card, Collapse, Empty, Layout, Spin, Tabs, Typography } from 'antd'
import { useEffect, useMemo,useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

interface TicketReferenceContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

type PriorityRow = { id: number; title: string; description?: string; color: string }
type TypeRow = { id: number; title: string; description?: string; color: string }
type StatusRow = {
  id: number
  title: string
  customer_title?: string
  description?: string
  color: string
}

type KnowledgeArticleRow = {
  id: string
  title: string
  description: string
  category?: string
}

/** Stable slug for grouping; label is derived for display. */
function faqCategorySlug(row: KnowledgeArticleRow): string {
  const raw = (row.category ?? 'general').trim() || 'general'
  return raw.toLowerCase()
}

function faqCategoryLabel(slug: string): string {
  if (slug === 'general') return 'General'
  return slug
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || res.statusText || 'Request failed')
  }
  return res.json()
}

function GlossaryBlock({
  title,
  color,
  body,
  descriptionAsHtml = false,
  emptyDescriptionHint = 'No description yet. Admins can add one in Settings → Ticket attributes.',
}: {
  title: string
  color: string
  body: string
  descriptionAsHtml?: boolean
  emptyDescriptionHint?: string
}) {
  const stripe = color && /^#?[0-9A-Fa-f]{3,8}$/.test(color.trim()) ? (color.startsWith('#') ? color : `#${color}`) : '#1890ff'
  const hasBody = body.trim().length > 0
  return (
    <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 4,
            minHeight: 40,
            borderRadius: 2,
            background: stripe,
            flexShrink: 0,
          }}
          aria-hidden
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: hasBody ? 8 : 0 }}>
            {title}
          </Text>
          {hasBody ? (
            descriptionAsHtml ? (
              <div
                className="ql-editor"
                style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }}
              />
            ) : (
              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{body.trim()}</Paragraph>
            )
          ) : (
            <Text type="secondary" italic>
              {emptyDescriptionHint}
            </Text>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function TicketReferenceContent({ user: currentUser }: TicketReferenceContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [priorities, setPriorities] = useState<PriorityRow[]>([])
  const [types, setTypes] = useState<TypeRow[]>([])
  const [statuses, setStatuses] = useState<StatusRow[]>([])
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticleRow[]>([])

  const isCustomer = (currentUser.role ?? '').toLowerCase() === 'customer'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [p, t, s, kb] = await Promise.all([
          apiFetch<PriorityRow[]>('/api/ticket-priorities'),
          apiFetch<TypeRow[]>('/api/ticket-types'),
          apiFetch<StatusRow[]>('/api/ticket-statuses'),
          apiFetch<KnowledgeArticleRow[]>('/api/knowledge-base-articles?published=true').catch(() => []),
        ])
        if (!cancelled) {
          setPriorities(Array.isArray(p) ? p : [])
          setTypes(Array.isArray(t) ? t : [])
          setStatuses(Array.isArray(s) ? s : [])
          setKnowledgeArticles(Array.isArray(kb) ? kb : [])
        }
      } catch {
        if (!cancelled) {
          setPriorities([])
          setTypes([])
          setStatuses([])
          setKnowledgeArticles([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const statusTitle = useMemo(
    () => (row: StatusRow) =>
      isCustomer && row.customer_title?.trim() ? row.customer_title.trim() : row.title,
    [isCustomer]
  )

  const faqCategoryTabItems = useMemo(() => {
    const groups = new Map<string, KnowledgeArticleRow[]>()
    for (const row of knowledgeArticles) {
      const key = faqCategorySlug(row)
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === 'general') return -1
      if (b === 'general') return 1
      return a.localeCompare(b)
    })
    const emptyFaqHint = 'No description yet. Admins can add one in Settings → Knowledge Base.'
    return keys.map((key) => ({
      key,
      label: faqCategoryLabel(key),
      children: (
        <Collapse
          accordion
          bordered={false}
          style={{ background: 'transparent' }}
          items={(groups.get(key) ?? []).map((row) => ({
            key: row.id,
            label: <Text strong>{row.title}</Text>,
            children: row.description?.trim() ? (
              <div
                className="ql-editor"
                style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(row.description) }}
              />
            ) : (
              <Text type="secondary" italic>
                {emptyFaqHint}
              </Text>
            ),
          }))}
        />
      ),
    }))
  }, [knowledgeArticles])

  const tabItems = [
    {
      key: 'priorities',
      label: 'Priorities',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : priorities.length === 0 ? (
        <Empty description="No priorities defined" />
      ) : (
        priorities.map((row) => (
          <GlossaryBlock key={row.id} title={row.title} color={row.color} body={row.description ?? ''} />
        ))
      ),
    },
    {
      key: 'types',
      label: 'Ticket types',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : types.length === 0 ? (
        <Empty description="No ticket types defined" />
      ) : (
        types.map((row) => (
          <GlossaryBlock key={row.id} title={row.title} color={row.color} body={row.description ?? ''} />
        ))
      ),
    },
    {
      key: 'statuses',
      label: 'Statuses',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : statuses.length === 0 ? (
        <Empty description="No statuses defined" />
      ) : (
        statuses.map((row) => (
          <GlossaryBlock
            key={row.id}
            title={statusTitle(row)}
            color={row.color}
            body={row.description ?? ''}
          />
        ))
      ),
    },
    {
      key: 'faq',
      label: 'FAQs',
      children: loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : knowledgeArticles.length === 0 ? (
        <Empty description="No published FAQ entries for your role" />
      ) : (
        <Tabs type="card" size="small" items={faqCategoryTabItems} />
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, background: 'var(--layout-bg)', minHeight: '100vh' }}>
            <Title level={2} style={{ marginTop: 0 }}>
              <ReadOutlined style={{ marginRight: 12 }} />
              Reference
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 24 }}>
              What ticket priorities, types, and statuses mean in this workspace, plus published FAQ (Frequently asked
              questions) entries visible to your role. Ticket attributes are maintained in Settings; FAQ content is edited
              under Settings → Knowledge Base.
            </Paragraph>
            <Tabs items={tabItems} />
          
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
