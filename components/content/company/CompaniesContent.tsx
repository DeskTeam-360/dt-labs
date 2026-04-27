'use client'

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Col, Form, Input, InputNumber, Layout, message, Modal, Popconfirm, Row, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo,useState } from 'react'

import AppTable from '@/components/common/AppTable'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import type { ColumnsType } from 'antd/es/table'

import DateDisplay from '@/components/common/DateDisplay'

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
  created_by?: string | null
  is_active: boolean
  color: string
  active_team_id?: string | null
  active_manager_id?: string | null
  active_time?: number
  is_customer?: boolean
  created_at: string
  updated_at: string
  last_ticket_updated_at?: string | null
}

interface LeaderOption {
  id: string
  full_name: string | null
  email: string
  role: string
}

interface TeamOption {
  id: string
  name: string
}

interface ManagerOption {
  id: string
  full_name: string | null
  email: string
  role: string
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
  const [leaderOptions, setLeaderOptions] = useState<LeaderOption[]>([])
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([])
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })

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

  const fetchLeaderOptions = async () => {
    try {
      const rows = await apiFetch<LeaderOption[]>('/api/users')
      setLeaderOptions(
        (rows || []).filter((u) => (u.role || '').toLowerCase() === 'customer' && !!u.email)
      )
      setManagerOptions(
        (rows || []).filter((u) => (u.role || '').toLowerCase() !== 'customer' && !!u.email)
      )
    } catch {
      setLeaderOptions([])
      setManagerOptions([])
    }
  }

  const fetchTeamOptions = async () => {
    try {
      const rows = await apiFetch<TeamOption[]>('/api/teams')
      setTeamOptions(
        (rows || []).map((t) => ({
          id: t.id,
          name: t.name,
        }))
      )
    } catch {
      setTeamOptions([])
    }
  }

  useEffect(() => {
    fetchCompanies()
    fetchLeaderOptions()
    fetchTeamOptions()
  }, [])

  const handleCreate = () => {
    setEditingCompany(null)
    form.resetFields()
    form.setFieldsValue({
      is_active: true,
      color: '#000000',
      email: undefined,
      leader_user_id: undefined,
      active_team_id: undefined,
      active_manager_id: undefined,
      active_time: 0,
      is_customer: false,
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
      leader_user_id: record.created_by || undefined,
      active_team_id: record.active_team_id || undefined,
      active_manager_id: record.active_manager_id || undefined,
      active_time: record.active_time ?? 0,
      is_customer: record.is_customer ?? false,
    })
    setModalVisible(true)
  }

  const handleDelete = async (companyId: string) => {
    try {
      await apiFetch(`/api/companies/${companyId}`, { method: 'DELETE' })
      message.success('Company deleted successfully')
      fetchCompanies()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete company')
    }
  }

  const handleSubmit = async (values: {
    name: string
    email?: string
    is_active: boolean
    color?: string
    leader_user_id?: string
    active_team_id?: string | null
    active_manager_id?: string | null
    active_time?: number | null
    is_customer?: boolean
  }) => {
    const staffPayload = {
      active_team_id: values.active_team_id ?? null,
      active_manager_id: values.active_manager_id ?? null,
      active_time: values.active_time ?? 0,
      is_customer: values.is_customer === true,
    }
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
            leader_user_id: values.leader_user_id,
            ...staffPayload,
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
            leader_user_id: values.leader_user_id,
            ...staffPayload,
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
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a, b) => (a.email || '').localeCompare(b.email || ''),
      sortDirections: ['ascend', 'descend'],
      render: (email: string) => email ? <a href={`mailto:${email}`}>{email}</a> : '—',
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
      render: (date: string) => <DateDisplay date={date} />,
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
              onClick={() => router.push(`/settings/companies/${record.id}`)}
            >
              Details
            </Button>
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              Edit
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete Company"
            description="Are you sure you want to delete this company?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
              >
                Delete
              </Button>
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

            <AppTable
              columns={columns}
              dataSource={filteredCompanies}
              rowKey="id"
              loading={loading}
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                showSizeChanger: true,
                pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                showTotal: appTableShowTotal('companies'),
                onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
              }}
            />
          </Card>

          <Modal
            title={editingCompany ? 'Edit Company' : 'Create Company'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={640}
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
                name="leader_user_id"
                label="Company Leader"
                rules={[{ required: true, message: 'Please select a company leader!' }]}
                
              >
                <Select
                  showSearch
                  placeholder="Select customer user as leader"
                  optionFilterProp="label"
                  options={leaderOptions.map((u) => ({
                    value: u.id,
                    label: `${u.full_name || u.email} (${u.email})`,
                  }))}
                />
              </Form.Item>

             

              <Form.Item
                name="active_team_id"
                label="Active team"
              >
                <Select
                  allowClear
                  showSearch
                  placeholder="Select team"
                  optionFilterProp="label"
                  options={teamOptions.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="active_manager_id"
                label="Active manager"
              >
                <Select
                  allowClear
                  showSearch
                  placeholder="Select manager"
                  optionFilterProp="label"
                  options={managerOptions.map((u) => ({
                    value: u.id,
                    label: `${u.full_name || u.email} (${u.email})`,
                  }))}
                />
              </Form.Item>

              <Row gutter={24}>
                <Col xs={24} sm={6}>
                  <Form.Item
                    name="active_time"
                    label="Active time"
                    initialValue={0}
                  >
                    <InputNumber min={0} precision={0} addonAfter="H" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={5}>
                  <Form.Item
                    name="Customer ?"
                    label="Customer ?"
                    valuePropName="checked"
                    initialValue={false}
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={5}>
                  <Form.Item
                    name="is_active"
                    label="Status ?"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="color" label="Color (hex)" initialValue="#000000">
                    <ColorPickerWithInput />
                  </Form.Item>
                </Col>
              </Row>

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

