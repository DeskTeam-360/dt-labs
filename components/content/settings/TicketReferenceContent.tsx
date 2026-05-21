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

/** Accent stripe for FAQ cards (knowledge articles have no per-row color). */
const FAQ_CATEGORY_COLORS: Record<string, string> = {
  general: '#1677ff',
  billing: '#722ed1',
  support: '#13c2c2',
  onboarding: '#52c41a',
}

function faqCategoryColor(category?: string): string {
  const slug = (category ?? 'general').trim().toLowerCase() || 'general'
  return FAQ_CATEGORY_COLORS[slug] ?? '#1890ff'
}

function glossaryStripeColor(color: string): string {
  return color && /^#?[0-9A-Fa-f]{3,8}$/.test(color.trim())
    ? color.startsWith('#')
      ? color
      : `#${color}`
    : '#1890ff'
}

function GlossaryBodyContent({
  body,
  descriptionAsHtml = false,
  emptyDescriptionHint = 'No description yet. Admins can add one in Settings → Ticket attributes.',
}: {
  body: string
  descriptionAsHtml?: boolean
  emptyDescriptionHint?: string
}) {
  const hasBody = body.trim().length > 0
  if (!hasBody) {
    return (
      <Text type="secondary" italic>
        {emptyDescriptionHint}
      </Text>
    )
  }
  if (descriptionAsHtml) {
    return (
      <div
        className="ql-editor"
        style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }}
      />
    )
  }
  return <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{body.trim()}</Paragraph>
}

function GlossaryAccordionLabel({ title, color }: { title: string; color: string }) {
  const stripe = glossaryStripeColor(color)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '4px 0' }}>
      <div
        style={{
          width: 4,
          minHeight: 22,
          borderRadius: 2,
          background: stripe,
          flexShrink: 0,
          alignSelf: 'stretch',
        }}
        aria-hidden
      />
      <Text strong style={{ fontSize: 15, lineHeight: 1.4 }}>
        {title}
      </Text>
    </div>
  )
}

function FaqGlossaryAccordion({ articles }: { articles: KnowledgeArticleRow[] }) {
  const emptyFaqHint = 'No description yet. Admins can add one in Settings → Knowledge Base.'
  return (
    <Collapse
      accordion
      bordered={false}
      expandIconPosition="end"
      style={{ background: 'transparent' }}
      items={articles.map((row) => ({
        key: row.id,
        label: <GlossaryAccordionLabel title={row.title} color={faqCategoryColor(row.category)} />,
        children: (
          <div style={{ padding: '4px 0 8px 18px' }}>
            <GlossaryBodyContent
              body={row.description ?? ''}
              descriptionAsHtml
              emptyDescriptionHint={emptyFaqHint}
            />
          </div>
        ),
        style: {
          marginBottom: 12,
          background: 'var(--ant-color-bg-container)',
          borderRadius: 8,
          border: '1px solid var(--ant-color-border-secondary)',
          overflow: 'hidden',
        },
      }))}
    />
  )
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
  const stripe = glossaryStripeColor(color)
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
          <GlossaryBodyContent
            body={body}
            descriptionAsHtml={descriptionAsHtml}
            emptyDescriptionHint={emptyDescriptionHint}
          />
        </div>
      </div>
    </Card>
  )
}

export default function TicketReferenceContent({ user: currentUser }: TicketReferenceContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<TypeRow[]>([])
  const [statuses, setStatuses] = useState<StatusRow[]>([])
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticleRow[]>([])

  const isCustomer = (currentUser.role ?? '').toLowerCase() === 'customer'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [t, s, kb] = await Promise.all([
          apiFetch<TypeRow[]>('/api/ticket-types'),
          apiFetch<StatusRow[]>('/api/ticket-statuses'),
          apiFetch<KnowledgeArticleRow[]>('/api/knowledge-base-articles?published=true').catch(() => []),
        ])
        if (!cancelled) {
          setTypes(Array.isArray(t) ? t : [])
          setStatuses(Array.isArray(s) ? s : [])
          setKnowledgeArticles(Array.isArray(kb) ? kb : [])
        }
      } catch {
        if (!cancelled) {
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

  const sortedFaqArticles = useMemo(() => {
    return [...knowledgeArticles].sort((a, b) => {
      const ca = faqCategorySlug(a)
      const cb = faqCategorySlug(b)
      if (ca === 'general') return -1
      if (cb === 'general') return 1
      const byCategory = ca.localeCompare(cb)
      if (byCategory !== 0) return byCategory
      return a.title.localeCompare(b.title)
    })
  }, [knowledgeArticles])

  const tabItems = [
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
        <FaqGlossaryAccordion articles={sortedFaqArticles} />
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
              What ticket types and statuses mean in this workspace, plus published FAQ (Frequently asked questions)
              entries visible to your role. Ticket attributes are maintained in Settings; FAQ content is edited under
              Settings → Knowledge Base.
            </Paragraph>
            <Tabs items={tabItems} />
          
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
