'use client'

import { ArrowDownOutlined, ArrowUpOutlined, LockOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, Flex, Layout, message, Popconfirm, Space, Switch, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { ALWAYS_VISIBLE, applyMenuPreferences, sidebarItemsForRole } from '@/lib/sidebar-menu'

const { Content } = Layout
const { Title, Text } = Typography

type Prefs = { order: string[]; hidden: string[]; locked: string[] }

/** Staff choose the order of their sidebar and hide what they do not use. Admins can lock items so nobody hides them. */
export default function MyMenuContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const role = (user.role ?? '').toLowerCase()
  const available = useMemo(() => sidebarItemsForRole(role), [role])
  const isAdmin = role === 'admin'

  const [order, setOrder] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [locked, setLocked] = useState<string[]>([])
  const [saved, setSaved] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState(false)

  const apply = (p: Prefs) => {
    // Show items in the order the person chose, then the rest in default order.
    const shown = applyMenuPreferences(
      available.map((i) => ({ key: i.key })),
      { order: p.order, hidden: [], locked: [] }
    ).map((i) => String(i.key))
    setOrder(shown)
    setHidden(p.hidden)
    setLocked(p.locked)
    setSaved(p)
  }

  useEffect(() => {
    fetch('/api/menu-preferences', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { order: [], hidden: [], locked: [] }))
      .then((p: Prefs) => apply(p))
      .catch(() => apply({ order: [], hidden: [], locked: [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const label = (k: string) => available.find((i) => i.key === k)?.label ?? k
  const dirty = !!saved && (JSON.stringify(order) !== JSON.stringify(applyMenuPreferences(available.map((i) => ({ key: i.key })), { order: saved.order, hidden: [], locked: [] }).map((i) => String(i.key))) || JSON.stringify([...hidden].sort()) !== JSON.stringify([...saved.hidden].sort()) || JSON.stringify([...locked].sort()) !== JSON.stringify([...saved.locked].sort()))

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order]
    const to = idx + dir
    if (to < 0 || to >= next.length) return
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setOrder(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/menu-preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, hidden, ...(isAdmin ? { locked } : {}) }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Failed to save')
      message.success('Menu saved')
      setSaved({ order, hidden, locked })
      // The sidebar reads the menu when the page loads.
      window.location.reload()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    const res = await fetch('/api/menu-preferences', { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return message.error('Failed to reset')
    window.location.reload()
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 720 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Title level={2} style={{ margin: 0 }}>My menu</Title>
              <Text type="secondary">Put the sidebar in the order you use it and hide what you do not need. This only changes your own menu.</Text>
            </div>

            <Card size="small">
              <Flex vertical gap={0}>
                {order.map((k, idx) => {
                  const isLocked = locked.includes(k) || ALWAYS_VISIBLE.includes(k)
                  const isHidden = hidden.includes(k) && !isLocked
                  return (
                    <Flex key={k} align="center" gap={12} style={{ padding: '10px 4px', borderBottom: idx < order.length - 1 ? '1px solid var(--ant-color-border-secondary, #f0f0f0)' : undefined }}>
                      <Space size={2}>
                        <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Move up" />
                        <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={idx === order.length - 1} onClick={() => move(idx, 1)} aria-label="Move down" />
                      </Space>
                      <Text style={{ flex: 1, opacity: isHidden ? 0.45 : 1 }}>{label(k)}</Text>
                      {isLocked ? (
                        <Tag icon={<LockOutlined />} style={{ margin: 0 }}>Always shown</Tag>
                      ) : null}
                      <Switch
                        checked={!isHidden}
                        disabled={isLocked}
                        checkedChildren="Shown"
                        unCheckedChildren="Hidden"
                        onChange={(on) => setHidden((h) => (on ? h.filter((x) => x !== k) : [...h, k]))}
                      />
                    </Flex>
                  )
                })}
              </Flex>
            </Card>

            {isAdmin ? (
              <Card size="small" title="Lock for everyone (admin)">
                <Text type="secondary">Ticked items cannot be hidden by anyone.</Text>
                <div style={{ marginTop: 8 }}>
                  <Checkbox.Group
                    value={locked.filter((k) => !ALWAYS_VISIBLE.includes(k))}
                    onChange={(v) => setLocked(v as string[])}
                    options={available.filter((i) => !ALWAYS_VISIBLE.includes(i.key)).map((i) => ({ value: i.key, label: i.label }))}
                  />
                </div>
              </Card>
            ) : null}

            {available.length === 0 ? <Alert type="info" showIcon title="Nothing to customize for this account." /> : null}

            <Flex gap={8}>
              <Button type="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
                Save menu
              </Button>
              <Popconfirm title="Back to the default menu?" okText="Reset" onConfirm={() => void reset()}>
                <Button>Reset to default</Button>
              </Popconfirm>
            </Flex>
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
