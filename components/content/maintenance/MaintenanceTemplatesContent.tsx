'use client'

import { ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Layout, message, Modal, Select, Space, Spin, Switch, Typography, Upload } from 'antd'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { DEFAULT_BRANDING, MAINTENANCE_SOURCES } from '@/lib/maintenance-sources'

const { Content } = Layout
const { Title, Text } = Typography

type TemplateRow = { id: string; key: string; name: string; is_active: boolean; item_count: number }
type Tpl = {
  id: string
  name: string
  is_active: boolean
  header_title: string
  header_subtitle: string
  header_image_url: string
  footer_text: string | null
  footer_image_url: string
  color_primary: string
  color_section: string
}
type EditItem = { section: string; label: string; options: string; source: string | null }

/** An image field: a web address or a file sent to the storage. */
function ImageField({ value, onChange, folder, hint }: { value: string; onChange: (v: string) => void; folder: string; hint: string }) {
  const [busy, setBusy] = useState(false)
  const upload = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('path', `maintenance/${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
      const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      onChange(body.url)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />
        <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => { void upload(f); return false }}>
          <Button icon={<UploadOutlined />} loading={busy}>Upload</Button>
        </Upload>
      </Space.Compact>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" style={{ maxHeight: 56, maxWidth: 240, objectFit: 'contain' }} />
      ) : null}
    </Space>
  )
}

export default function MaintenanceTemplatesContent({ user }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [list, setList] = useState<TemplateRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [tpl, setTpl] = useState<Tpl | null>(null)
  const [items, setItems] = useState<EditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const loadList = useCallback(async () => {
    const res = await fetch('/api/maintenance-templates?all=1', { credentials: 'include' })
    const body = await res.json().catch(() => ({}))
    const rows: TemplateRow[] = body.data ?? []
    setList(rows)
    return rows
  }, [])

  const loadOne = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/maintenance-templates/${id}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      setTpl(body.template)
      setItems((body.items ?? []).map((i: { section: string; label: string; options: string[]; source: string | null }) => ({ section: i.section, label: i.label, options: i.options.join(', '), source: i.source })))
      setDirty(false)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not load the template')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList().then((rows) => {
      if (rows[0]) setSelected(rows[0].id)
      else setLoading(false)
    })
  }, [loadList])

  useEffect(() => {
    if (selected) void loadOne(selected)
  }, [selected, loadOne])

  const setField = (patch: Partial<Tpl>) => {
    setTpl((t) => (t ? { ...t, ...patch } : t))
    setDirty(true)
  }
  const setItem = (i: number, patch: Partial<EditItem>) => {
    setItems((prev) => prev.map((x, n) => (n === i ? { ...x, ...patch } : x)))
    setDirty(true)
  }
  const move = (i: number, d: -1 | 1) => {
    setItems((prev) => {
      const j = i + d
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setDirty(true)
  }
  const addItem = () => {
    setItems((prev) => [...prev, { section: prev[prev.length - 1]?.section ?? 'Security Check', label: '', options: 'Done', source: null }])
    setDirty(true)
  }

  const save = async () => {
    if (!tpl) return
    setSaving(true)
    try {
      const res = await fetch(`/api/maintenance-templates/${tpl.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tpl, items: items.map((i) => ({ section: i.section, label: i.label, options: i.options.split(',').map((o) => o.trim()).filter(Boolean), source: i.source })) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      message.success('Template saved. New reports use it.')
      setDirty(false)
      await loadList()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const create = async (copyFrom?: string) => {
    const name = newName.trim()
    if (!name) return message.warning('Give the new template a name')
    setCreating(true)
    try {
      const res = await fetch('/api/maintenance-templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, copy_from: copyFrom }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      setNewName('')
      await loadList()
      setSelected(body.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not create the template')
    } finally {
      setCreating(false)
    }
  }

  const choose = (id: string) => {
    if (!dirty) return setSelected(id)
    Modal.confirm({ title: 'Discard your changes?', content: 'This template has changes that are not saved.', okText: 'Discard', onOk: () => setSelected(id) })
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: 24, margin: '0 auto', width: '100%', maxWidth: 1200 }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back</Button>
              </SpaNavLink>
              <Title level={2} style={{ margin: '8px 0 0' }}>Maintenance report templates</Title>
              <Text type="secondary">The checklist and the header and footer of the website maintenance reports. Changes apply to new reports; items of a report that was already made stay as they were.</Text>
            </div>

            <Card size="small" title="Templates">
              <Space wrap>
                {list.map((t) => (
                  <Button key={t.id} type={t.id === selected ? 'primary' : 'default'} onClick={() => choose(t.id)}>
                    {t.name}{!t.is_active ? ' (hidden)' : ''} · {t.item_count}
                  </Button>
                ))}
                <Input style={{ width: 220 }} placeholder="New template name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Button icon={<PlusOutlined />} loading={creating} onClick={() => void create()}>Add empty</Button>
                <Button icon={<CopyOutlined />} loading={creating} disabled={!selected} onClick={() => void create(selected ?? undefined)}>Add as copy of selected</Button>
              </Space>
            </Card>

            {loading ? (
              <Spin />
            ) : !tpl ? (
              <Alert type="info" showIcon title="No template yet. Add one above." />
            ) : (
              <>
                <Card size="small" title="Name and look">
                  <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                    <Space wrap>
                      <Input style={{ width: 320 }} addonBefore="Name" value={tpl.name} onChange={(e) => setField({ name: e.target.value })} />
                      <Space>
                        <Switch checked={tpl.is_active} onChange={(v) => setField({ is_active: v })} />
                        <Text>Available for new reports</Text>
                      </Space>
                    </Space>
                    <Input addonBefore="Header title" placeholder={`${tpl.name} (the template name)`} value={tpl.header_title} onChange={(e) => setField({ header_title: e.target.value })} />
                    <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder="Header text under the title (optional)" value={tpl.header_subtitle} onChange={(e) => setField({ header_subtitle: e.target.value })} />
                    <div>
                      <Text type="secondary">Header image (logo). Empty = the DeskTeam360 logo.</Text>
                      <ImageField value={tpl.header_image_url} folder="header" hint={DEFAULT_BRANDING.headerImageUrl} onChange={(v) => setField({ header_image_url: v })} />
                    </div>
                    <div>
                      <Text type="secondary">Footer text. Empty = {DEFAULT_BRANDING.footerText}. Use a single space for no text.</Text>
                      <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder={DEFAULT_BRANDING.footerText} value={tpl.footer_text ?? ''} onChange={(e) => setField({ footer_text: e.target.value === '' ? null : e.target.value })} />
                    </div>
                    <div>
                      <Text type="secondary">Footer image (banner, optional)</Text>
                      <ImageField value={tpl.footer_image_url} folder="footer" hint="https://..." onChange={(v) => setField({ footer_image_url: v })} />
                    </div>
                    <Space wrap>
                      <Space>
                        <Text>Main colour</Text>
                        <input type="color" value={tpl.color_primary || DEFAULT_BRANDING.colorPrimary} onChange={(e) => setField({ color_primary: e.target.value })} />
                        <Button size="small" onClick={() => setField({ color_primary: '' })}>Reset</Button>
                      </Space>
                      <Space>
                        <Text>Section colour</Text>
                        <input type="color" value={tpl.color_section || DEFAULT_BRANDING.colorSection} onChange={(e) => setField({ color_section: e.target.value })} />
                        <Button size="small" onClick={() => setField({ color_section: '' })}>Reset</Button>
                      </Space>
                    </Space>
                  </Space>
                </Card>

                <Card size="small" title={`Checklist (${items.length} items)`}>
                  <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                    <Text type="secondary">
                      Items with the same section name are grouped under it, in the order shown. Status options are separated by commas; the first one is the good outcome, the others count as a problem.
                      An automatic source fills the item by itself; leave it empty for a manual check.
                    </Text>
                    {items.map((it, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) minmax(200px,2fr) minmax(160px,1.4fr) minmax(160px,1.2fr) auto', gap: 8, alignItems: 'center' }}>
                        <Input placeholder="Section" value={it.section} onChange={(e) => setItem(i, { section: e.target.value })} />
                        <Input placeholder="Item" value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
                        <Input placeholder="Done, Problem found" value={it.options} onChange={(e) => setItem(i, { options: e.target.value })} />
                        <Select allowClear placeholder="Manual" value={it.source ?? undefined} options={MAINTENANCE_SOURCES} onChange={(v) => setItem(i, { source: v ?? null })} />
                        <Space.Compact>
                          <Button icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                          <Button icon={<ArrowDownOutlined />} disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                          <Button danger icon={<DeleteOutlined />} onClick={() => { setItems((prev) => prev.filter((_, n) => n !== i)); setDirty(true) }} />
                        </Space.Compact>
                      </div>
                    ))}
                    <Button icon={<PlusOutlined />} onClick={addItem}>Add item</Button>
                  </Space>
                </Card>

                <Space>
                  <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void save()}>Save template</Button>
                  {dirty ? <Text type="warning">Unsaved changes</Text> : null}
                </Space>
              </>
            )}
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
