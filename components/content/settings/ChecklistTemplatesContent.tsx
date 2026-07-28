'use client'

import {
  ArrowLeftOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Collapse,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

type TemplateGroup = { id: string; title: string; order_index: number }
type TemplateItem = { id: string; group_id: string | null; title: string; order_index: number }
type TemplateDetail = {
  id: string
  title: string
  description: string | null
  groups: TemplateGroup[]
  items: TemplateItem[]
}
type TemplateSummary = { id: string; title: string; description: string | null }

interface Props {
  user: { id?: string; email?: string | null; name?: string | null; role?: string | null }
}

export default function ChecklistTemplatesContent({ user: currentUser }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDetail, setActiveDetail] = useState<TemplateDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Create template modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [createForm] = Form.useForm<{ title: string; description?: string }>()

  // Edit template name modal
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm] = Form.useForm<{ title: string; description?: string }>()

  // Add group modal
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupSaving, setGroupSaving] = useState(false)
  const [groupForm] = Form.useForm<{ title: string }>()

  // Add item modal
  const [itemOpen, setItemOpen] = useState(false)
  const [itemSaving, setItemSaving] = useState(false)
  const [itemGroupId, setItemGroupId] = useState<string | null>(null)
  const [itemForm] = Form.useForm<{ title: string }>()

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/checklist-templates', { credentials: 'include' })
      const body = await res.json().catch(() => [])
      setTemplates(Array.isArray(body) ? body : [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/checklist-templates/${id}`, { credentials: 'include' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) throw new Error(body?.error || 'Failed')
      setActiveDetail(body as TemplateDetail)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load template')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  // ── Create template ──────────────────────────────────────────────
  const openCreate = () => {
    createForm.resetFields()
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    const v = await createForm.validateFields()
    setCreateSaving(true)
    try {
      const res = await fetch('/api/checklist-templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: v.title, description: v.description }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed')
      message.success('Template created')
      setCreateOpen(false)
      await loadTemplates()
      await loadDetail(body.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreateSaving(false)
    }
  }

  // ── Edit template name ───────────────────────────────────────────
  const openEdit = () => {
    if (!activeDetail) return
    editForm.setFieldsValue({ title: activeDetail.title, description: activeDetail.description ?? '' })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!activeDetail) return
    const v = await editForm.validateFields()
    setEditSaving(true)
    try {
      const res = await fetch(`/api/checklist-templates/${activeDetail.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: v.title, description: v.description }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed')
      message.success('Saved')
      setEditOpen(false)
      await loadTemplates()
      await loadDetail(activeDetail.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete template ──────────────────────────────────────────────
  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/checklist-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed')
      message.success('Deleted')
      setActiveDetail(null)
      await loadTemplates()
    } catch {
      message.error('Failed to delete')
    }
  }

  // ── Add group ────────────────────────────────────────────────────
  const openAddGroup = () => {
    groupForm.resetFields()
    setGroupOpen(true)
  }

  const submitAddGroup = async () => {
    if (!activeDetail) return
    const v = await groupForm.validateFields()
    setGroupSaving(true)
    try {
      const res = await fetch(`/api/checklist-templates/${activeDetail.id}/groups`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: v.title, order_index: activeDetail.groups.length }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed')
      message.success('Group added')
      setGroupOpen(false)
      await loadDetail(activeDetail.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setGroupSaving(false)
    }
  }

  const deleteGroup = async (gid: string) => {
    if (!activeDetail) return
    try {
      await fetch(`/api/checklist-templates/${activeDetail.id}/groups/${gid}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      message.success('Group deleted')
      await loadDetail(activeDetail.id)
    } catch {
      message.error('Failed')
    }
  }

  // ── Add item ─────────────────────────────────────────────────────
  const openAddItem = (groupId: string | null) => {
    setItemGroupId(groupId)
    itemForm.resetFields()
    setItemOpen(true)
  }

  const submitAddItem = async () => {
    if (!activeDetail) return
    const v = await itemForm.validateFields()
    setItemSaving(true)
    try {
      const res = await fetch(`/api/checklist-templates/${activeDetail.id}/items`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: v.title,
          group_id: itemGroupId,
          order_index: activeDetail.items.filter((i) => i.group_id === itemGroupId).length,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed')
      message.success('Item added')
      setItemOpen(false)
      await loadDetail(activeDetail.id)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setItemSaving(false)
    }
  }

  const deleteItem = async (iid: string) => {
    if (!activeDetail) return
    try {
      await fetch(`/api/checklist-templates/${activeDetail.id}/items/${iid}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      message.success('Item deleted')
      await loadDetail(activeDetail.id)
    } catch {
      message.error('Failed')
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  const ungroupedItems = activeDetail?.items.filter((i) => !i.group_id) ?? []

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <SpaNavLink href="/settings" style={{ fontSize: 14 }}>
                <ArrowLeftOutlined /> Back to Settings
              </SpaNavLink>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                New Template
              </Button>
            </Space>

            <Space align="center">
              <CheckSquareOutlined style={{ fontSize: 28, color: '#1677ff' }} />
              <Title level={2} style={{ margin: 0 }}>
                Checklist Templates
              </Title>
            </Space>

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Template list */}
              <Card size="small" loading={loading} style={{ minWidth: 240, width: 240, flexShrink: 0 }}>
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  {templates.length === 0 && !loading && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      No templates yet.
                    </Text>
                  )}
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => void loadDetail(t.id)}
                      style={{
                        cursor: 'pointer',
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: activeDetail?.id === t.id ? 'var(--ant-color-primary-bg, #e6f4ff)' : 'transparent',
                        fontWeight: activeDetail?.id === t.id ? 600 : 400,
                        fontSize: 14,
                      }}
                    >
                      {t.title}
                    </div>
                  ))}
                </Space>
              </Card>

              {/* Template detail */}
              {activeDetail ? (
                <Card
                  size="small"
                  loading={detailLoading}
                  style={{ flex: 1 }}
                  title={
                    <Space>
                      <Text strong>{activeDetail.title}</Text>
                      <Button size="small" icon={<EditOutlined />} type="text" onClick={openEdit} />
                      <Popconfirm
                        title="Delete this template?"
                        description="All groups and items will be removed."
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void deleteTemplate(activeDetail.id)}
                      >
                        <Button size="small" icon={<DeleteOutlined />} type="text" danger />
                      </Popconfirm>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button size="small" icon={<PlusOutlined />} onClick={openAddGroup}>
                        Add Group
                      </Button>
                      <Button size="small" icon={<PlusOutlined />} type="primary" onClick={() => openAddItem(null)}>
                        Add Item (no group)
                      </Button>
                    </Space>
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {activeDetail.description && (
                      <Text type="secondary">{activeDetail.description}</Text>
                    )}

                    {/* Groups */}
                    {activeDetail.groups.length > 0 && (
                      <Collapse
                        size="small"
                        defaultActiveKey={activeDetail.groups.map((g) => g.id)}
                        items={activeDetail.groups.map((g) => ({
                          key: g.id,
                          label: (
                            <Space>
                              <Text strong>{g.title}</Text>
                              <Tag>{activeDetail.items.filter((i) => i.group_id === g.id).length} items</Tag>
                            </Space>
                          ),
                          extra: (
                            <Space onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => openAddItem(g.id)}
                              >
                                Add item
                              </Button>
                              <Popconfirm
                                title="Delete group?"
                                description="Items in this group will become ungrouped."
                                okText="Delete"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => void deleteGroup(g.id)}
                              >
                                <Button size="small" danger icon={<DeleteOutlined />} type="text" />
                              </Popconfirm>
                            </Space>
                          ),
                          children: (
                            <Space direction="vertical" style={{ width: '100%' }} size={4}>
                              {activeDetail.items
                                .filter((i) => i.group_id === g.id)
                                .sort((a, b) => a.order_index - b.order_index)
                                .map((item) => (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '4px 8px',
                                      background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
                                      borderRadius: 4,
                                    }}
                                  >
                                    <Text style={{ fontSize: 13 }}>{item.title}</Text>
                                    <Popconfirm
                                      title="Delete item?"
                                      okText="Delete"
                                      okButtonProps={{ danger: true }}
                                      onConfirm={() => void deleteItem(item.id)}
                                    >
                                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </div>
                                ))}
                              {activeDetail.items.filter((i) => i.group_id === g.id).length === 0 && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  No items in this group yet.
                                </Text>
                              )}
                            </Space>
                          ),
                        }))}
                      />
                    )}

                    {/* Ungrouped items */}
                    {ungroupedItems.length > 0 && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
                          Ungrouped items
                        </Text>
                        <Space direction="vertical" style={{ width: '100%' }} size={4}>
                          {ungroupedItems
                            .sort((a, b) => a.order_index - b.order_index)
                            .map((item) => (
                              <div
                                key={item.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 8px',
                                  background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
                                  borderRadius: 4,
                                }}
                              >
                                <Text style={{ fontSize: 13 }}>{item.title}</Text>
                                <Popconfirm
                                  title="Delete item?"
                                  okText="Delete"
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() => void deleteItem(item.id)}
                                >
                                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              </div>
                            ))}
                        </Space>
                      </div>
                    )}

                    {activeDetail.groups.length === 0 && ungroupedItems.length === 0 && (
                      <Text type="secondary">No groups or items yet. Add a group or item above.</Text>
                    )}
                  </Space>
                </Card>
              ) : (
                <Card size="small" style={{ flex: 1 }}>
                  <Text type="secondary">Select a template from the list to view and edit it.</Text>
                </Card>
              )}
            </div>
          </Space>
        </Content>
      </AdminMainColumn>

      {/* Create template modal */}
      <Modal
        title="New Checklist Template"
        open={createOpen}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={createSaving}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Template Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Onboarding Checklist" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit template modal */}
      <Modal
        title="Edit Template"
        open={editOpen}
        onOk={() => void submitEdit()}
        onCancel={() => setEditOpen(false)}
        confirmLoading={editSaving}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Template Name" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add group modal */}
      <Modal
        title="Add Group"
        open={groupOpen}
        onOk={() => void submitAddGroup()}
        onCancel={() => setGroupOpen(false)}
        confirmLoading={groupSaving}
        destroyOnHidden
      >
        <Form form={groupForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Group Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Before Deployment" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add item modal */}
      <Modal
        title={itemGroupId ? 'Add Item to Group' : 'Add Ungrouped Item'}
        open={itemOpen}
        onOk={() => void submitAddItem()}
        onCancel={() => setItemOpen(false)}
        confirmLoading={itemSaving}
        destroyOnHidden
      >
        <Form form={itemForm} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label="Item Title" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Notify stakeholders" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
