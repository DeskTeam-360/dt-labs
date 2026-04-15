'use client'

import { KeyOutlined,PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'

const { Text, Title } = Typography

type Member = {
  id: string
  email: string
  full_name: string | null
  status: string
  company_role: string
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText || 'Request failed')
  }
  return data as T
}

export default function CustomerPortalTeamSection({ companyId }: { companyId: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [form] = Form.useForm<{ email: string; password: string; full_name?: string }>()
  const [resetForm] = Form.useForm<{ password: string; confirm: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiJson<{ members: Member[] }>(`/api/companies/${companyId}/portal-members`)
      setMembers(data.members || [])
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to load team')
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const openReset = (userId: string) => {
    setResetUserId(userId)
    resetForm.resetFields()
  }

  const columns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, row: Member) => row.full_name || '—',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Role',
      key: 'role',
      width: 120,
      render: (_: unknown, row: Member) =>
        row.company_role === 'company_admin' ? <Tag color="blue">Portal admin</Tag> : <Tag>Member</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, row: Member) => (
        <Button type="primary" icon={<KeyOutlined />} onClick={() => openReset(row.id)}>
          Reset password
        </Button>
      ),
    },
  ]

  return (
    <>
      <section style={{ marginBottom: 24, marginTop: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            Portal accounts
          </Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add account
          </Button>
        </div>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Create logins for colleagues in your organization and reset their passwords when needed.
        </Text>
        <Table<Member>
          size="small"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={members}
          pagination={false}
        />
      </section>

      <Modal
        title="Add portal user"
        open={addOpen}
        onCancel={() => {
          setAddOpen(false)
          form.resetFields()
        }}
        okText="Create"
        confirmLoading={addLoading}
        onOk={async () => {
          try {
            const values = await form.validateFields()
            setAddLoading(true)
            await apiJson(`/api/companies/${companyId}/portal-members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: values.email,
                password: values.password,
                full_name: values.full_name || '',
              }),
            })
            message.success('User created')
            setAddOpen(false)
            form.resetFields()
            load()
          } catch (e: unknown) {
            if (e && typeof e === 'object' && 'errorFields' in e) return
            message.error(e instanceof Error ? e.message : 'Failed to create user')
          } finally {
            setAddLoading(false)
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Required' },
              { type: 'email', message: 'Invalid email' },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="full_name" label="Full name">
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="Initial password"
            rules={[{ required: true, message: 'Required' }, { min: 6, message: 'At least 6 characters' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Reset password"
        open={!!resetUserId}
        onCancel={() => {
          setResetUserId(null)
          resetForm.resetFields()
        }}
        okText="Save"
        confirmLoading={resetLoading}
        onOk={async () => {
          if (!resetUserId) return
          try {
            const v = await resetForm.validateFields()
            if (v.password !== v.confirm) {
              message.error('Passwords do not match')
              return
            }
            setResetLoading(true)
            await apiJson(`/api/companies/${companyId}/portal-members/${resetUserId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: v.password }),
            })
            message.success('Password updated')
            setResetUserId(null)
            resetForm.resetFields()
          } catch (e: unknown) {
            if (e && typeof e === 'object' && 'errorFields' in e) return
            message.error(e instanceof Error ? e.message : 'Failed to reset password')
          } finally {
            setResetLoading(false)
          }
        }}
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="password"
            label="New password"
            rules={[{ required: true, message: 'Required' }, { min: 6, message: 'At least 6 characters' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm password"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
