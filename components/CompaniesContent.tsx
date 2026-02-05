'use client'

import { Layout, Table, Button, Space, Typography, Card, Tag, Modal, Form, Input, Switch, message, Popconfirm, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import type { ColumnsType } from 'antd/es/table'

const { Content } = Layout
const { Title } = Typography

interface CompaniesContentProps {
  user: User
}

interface CompanyRecord {
  id: string
  name: string
  is_active: boolean
  color: string
  created_at: string
  updated_at: string
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
  const [form] = Form.useForm()
  const supabase = createClient()

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setCompanies(data || [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch companies')
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
    })
    setModalVisible(true)
  }

  const handleEdit = (record: CompanyRecord) => {
    setEditingCompany(record)
    form.setFieldsValue({
      name: record.name,
      is_active: record.is_active,
      color: record.color || '#000000',
    })
    setModalVisible(true)
  }

  const handleDelete = async (companyId: string) => {
    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId)

      if (error) throw error

      message.success('Company deleted successfully')
      fetchCompanies()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete company')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingCompany) {
        // Update existing company
        const { error } = await supabase
          .from('companies')
          .update({
            name: values.name,
            is_active: values.is_active,
            color: values.color || '#000000',
          })
          .eq('id', editingCompany.id)

        if (error) throw error

        message.success('Company updated successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCompanies()
      } else {
        // Create new company
        const { error } = await supabase
          .from('companies')
          .insert({
            name: values.name,
            is_active: values.is_active,
            color: values.color || '#000000',
          })

        if (error) throw error

        message.success('Company created successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCompanies()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to save company')
    }
  }

  const columns: ColumnsType<CompanyRecord> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
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
      render: (date: string) => <DateDisplay date={date} />,
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
              size="small"
              onClick={() => router.push(`/companies/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            />
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
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Title level={2} style={{ margin: 0 }}>Companies Management</Title>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                Add Company
              </Button>
            </div>

            <Table
              columns={columns}
              dataSource={companies}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} companies`,
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
      </Layout>
    </Layout>
  )
}

