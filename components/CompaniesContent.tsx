'use client'

import { Layout, Table, Button, Space, Typography, Card, Tag, Modal, Form, Input, Switch, message, Popconfirm, Tooltip, Select } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo, type Key } from 'react'
import { useRouter } from 'next/navigation'
import AdminSidebar from './AdminSidebar'
import AdminMainColumn from './AdminMainColumn'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import DateDisplay from './DateDisplay'
import { SpaNavLink, shouldOpenHrefInNewTab } from './SpaNavLink'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography
const { Option } = Select

interface CompaniesContentProps {
  user: { id: string; email?: string | null; name?: string | null }
}

interface CompanyRecord {
  id: string
  name: string
  email?: string | null
  is_active: boolean
  color: string
  created_at: string
  updated_at: string
  last_ticket_updated_at?: string | null
}

function ColorPickerWithInput({
  value,
  onChange,
  ...rest
}: {
  value?: string
  onChange?: (v: string) => void
} & React.ComponentProps<typeof Input>) {
  const hex = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000'
  return (
    <Space align="center" style={{ width: '100%' }}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: 40,
          height: 32,
          padding: 2,
          cursor: 'pointer',
          border: '1px solid #d9d9d9',
          borderRadius: 6,
        }}
      />
      <Input
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#000000"
        style={{ width: 120 }}
        {...rest}
      />
    </Space>
  )
}

export default function CompaniesContent({ user: currentUser }: CompaniesContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [companies, setCompanies] = useState<CompanyRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyRecord | null>(null)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<boolean | undefined>(undefined)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [bulkAction, setBulkAction] = useState<'active' | 'inactive' | 'delete' | null>(null)

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase()
        const matchesSearch =
          (c.name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        if (!matchesSearch) return false
      }
      if (filterStatus !== undefined && c.is_active !== filterStatus) return false
      return true
    })
  }, [companies, searchText, filterStatus])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: CompanyRecord[] }>('/api/companies')
      setCompanies(res.data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch companies')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanies()
  }, [])

  const handleCreate = () => {
    setEditingCompany(null)
    form.resetFields()
    form.setFieldsValue({
      is_active: true,
      color: '#000000',
      email: undefined,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: CompanyRecord) => {
    setEditingCompany(record)
    form.setFieldsValue({
      name: record.name,
      email: record.email || '',
      is_active: record.is_active,
      color: record.color || '#000000',
    })
    setModalVisible(true)
  }

  const handleDelete = async (companyId: string) => {
    try {
      await apiFetch(`/api/companies/${companyId}`, { method: 'DELETE' })
      message.success('Company deleted successfully')
      setSelectedRowKeys((keys) => keys.filter((k) => String(k) !== companyId))
      fetchCompanies()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete company')
    }
  }

  const handleBulkStatus = async (is_active: boolean) => {
    const ids = selectedRowKeys.map(String)
    if (ids.length === 0) return
    setBulkAction(is_active ? 'active' : 'inactive')
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          apiFetch(`/api/companies/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active }),
          })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      const label = is_active ? 'active' : 'inactive'
      if (ok > 0) message.success(`Updated ${ok} compan${ok === 1 ? 'y' : 'ies'} to ${label}`)
      if (failed > 0) message.error(`${failed} update(s) failed`)
      setSelectedRowKeys([])
      fetchCompanies()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Bulk update failed')
    } finally {
      setBulkAction(null)
    }
  }

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys.map(String)
    if (ids.length === 0) return
    setBulkAction('delete')
    try {
      const results = await Promise.allSettled(
        ids.map((id) => apiFetch(`/api/companies/${id}`, { method: 'DELETE' }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const ok = results.length - failed
      if (ok > 0) message.success(`Deleted ${ok} compan${ok === 1 ? 'y' : 'ies'}`)
      if (failed > 0) message.error(`${failed} delete(s) failed`)
      setSelectedRowKeys([])
      fetchCompanies()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Bulk delete failed')
    } finally {
      setBulkAction(null)
    }
  }

  const handleSubmit = async (values: { name: string; email?: string; is_active: boolean; color?: string }) => {
    try {
      if (editingCompany) {
        await apiFetch(`/api/companies/${editingCompany.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            email: values.email?.trim() || null,
            is_active: values.is_active,
            color: values.color || '#000000',
          }),
        })
        message.success('Company updated successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCompanies()
      } else {
        await apiFetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            email: values.email?.trim() || null,
            is_active: values.is_active,
            color: values.color || '#000000',
          }),
        })
        message.success('Company created successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCompanies()
      }
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save company')
    }
  }

  const columns: ColumnsType<CompanyRecord> = [
    {
      title: 'Company',
      key: 'company',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <SpaNavLink
          href={`/companies/${record.id}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.email || '—'}</div>
          </div>
        </SpaNavLink>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      sorter: (a, b) => (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0),
      sortDirections: ['ascend', 'descend'],
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'green' : 'default'}>
          {is_active ? 'ACTIVE' : 'INACTIVE'}
        </Tag>
      ),
    },
    {
      title: 'Color',
      dataIndex: 'color',
      key: 'color',
      width: 120,
      render: (color: string) => (
        <Space>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              backgroundColor: color || '#000000',
              border: '1px solid #d9d9d9',
            }}
          />
          <Typography.Text type="secondary">{color || '#000000'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      sortDirections: ['ascend', 'descend'],
      render: (date: string) => <DateDisplay date={date} format="date-only" />,
    },
    {
      title: 'Last ticket update',
      dataIndex: 'last_ticket_updated_at',
      key: 'last_ticket_updated_at',
      sorter: (a, b) => {
        const ta = a.last_ticket_updated_at
          ? new Date(a.last_ticket_updated_at).getTime()
          : 0
        const tb = b.last_ticket_updated_at
          ? new Date(b.last_ticket_updated_at).getTime()
          : 0
        return ta - tb
      },
      sortDirections: ['ascend', 'descend'],
      render: (iso: string | null | undefined) =>
        iso ? <DateDisplay date={iso} /> : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="default"
              icon={<EyeOutlined />}
              href={`/companies/${record.id}`}
              aria-label="View company details"
              onClick={(e) => {
                if (shouldOpenHrefInNewTab(e)) return
                if (e.button !== 0) return
                e.preventDefault()
                router.push(`/companies/${record.id}`)
              }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="primary" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete Company"
            description="Are you sure you want to delete this company?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button type="primary" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
              <Title level={2} style={{ margin: 0 }}>Companies Management</Title>
              <Space wrap>
                <Input
                  placeholder="Search by name or email..."
                  prefix={<SearchOutlined />}
                  allowClear
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value)
                    setPagination((p) => ({ ...p, current: 1 }))
                  }}
                  style={{ width: 260 }}
                />
                <Select
                  placeholder="Filter by Status"
                  allowClear
                  value={filterStatus}
                  onChange={(v) => {
                    setFilterStatus(v)
                    setPagination((p) => ({ ...p, current: 1 }))
                  }}
                  style={{ width: 150 }}
                >
                  <Option value={true}>Active</Option>
                  <Option value={false}>Inactive</Option>
                </Select>
                <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                Add Company
              </Button>
              </Space>
            </div>

            {selectedRowKeys.length > 0 && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  background: '#e6f4ff',
                  border: '1px solid #91caff',
                  borderRadius: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Typography.Text strong>
                  {selectedRowKeys.length} selected
                </Typography.Text>
                <Space wrap>
                  <Button
                    icon={<CheckCircleOutlined />}
                    loading={bulkAction === 'active'}
                    disabled={bulkAction !== null && bulkAction !== 'active'}
                    onClick={() => handleBulkStatus(true)}
                  >
                    Set active
                  </Button>
                  <Button
                    icon={<StopOutlined />}
                    loading={bulkAction === 'inactive'}
                    disabled={bulkAction !== null && bulkAction !== 'inactive'}
                    onClick={() => handleBulkStatus(false)}
                  >
                    Set inactive
                  </Button>
                  <Popconfirm
                    title="Delete selected companies?"
                    description={`This will permanently delete ${selectedRowKeys.length} compan${selectedRowKeys.length === 1 ? 'y' : 'ies'}.`}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                    onConfirm={handleBulkDelete}
                    disabled={bulkAction !== null}
                  >
                    <span>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        loading={bulkAction === 'delete'}
                        disabled={bulkAction !== null && bulkAction !== 'delete'}
                      >
                        Bulk delete
                      </Button>
                    </span>
                  </Popconfirm>
                  <Button
                    type="link"
                    onClick={() => setSelectedRowKeys([])}
                    disabled={bulkAction !== null}
                  >
                    Clear selection
                  </Button>
                </Space>
              </div>
            )}

            <div
              style={{
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <Table<CompanyRecord>
                columns={columns}
                dataSource={filteredCompanies}
                rowKey="id"
                loading={loading}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                scroll={{ x: 'max-content' }}
                tableLayout="auto"
                pagination={{
                  current: pagination.current,
                  pageSize: pagination.pageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '15', '20', '50'],
                  showTotal: (total) => `Total ${total} companies`,
                  onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
                  responsive: true,
                }}
              />
            </div>
          </Card>

          <Modal
            title={editingCompany ? 'Edit Company' : 'Create Company'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={600}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
            >
              <Form.Item
                name="name"
                label="Company Name"
                rules={[{ required: true, message: 'Please enter company name!' }]}
              >
                <Input placeholder="Company Name" />
              </Form.Item>

              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: 'email', message: 'Invalid email!', required: true }]}
              >
                <Input type="email" placeholder="support@company.com" />
              </Form.Item>

              <Form.Item
                name="is_active"
                label="Status"
                valuePropName="checked"
              >
                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
              </Form.Item>

              <Form.Item name="color" label="Color (hex)" initialValue="#000000">
                <ColorPickerWithInput />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingCompany ? 'Update' : 'Create'}
                  </Button>
                  <Button onClick={() => {
                    setModalVisible(false)
                    form.resetFields()
                  }}>
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

