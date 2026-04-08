'use client'

import { Descriptions, Space, Typography, Button, Modal, Select, message, Popconfirm, Switch, Tag } from 'antd'
import { PlusOutlined, DeleteOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DateDisplay from '../DateDisplay'
import { confirmUserCompanyMove } from '@/components/confirm-user-company-move'
import { SpaNavLink } from '@/components/SpaNavLink'

const { Text } = Typography

interface CompanyUserRow {
  user_id: string
  created_at: string
  company_role?: string
  users: { id: string; full_name: string | null; email: string | null; role?: string | null }
}

interface ApiUser {
  id: string
  email: string
  full_name: string | null
  role: string
  company_id: string | null
  company?: { id: string; name: string } | null
}

interface TabUsersProps {
  companyData: { id: string; name?: string; company_users?: CompanyUserRow[] }
  /** System admin: assign which customer can manage portal accounts for this company */
  viewerIsGlobalAdmin?: boolean
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function TabUsers({ companyData, viewerIsGlobalAdmin = false }: TabUsersProps) {
  const router = useRouter()
  const companyId = companyData.id
  const companyName = companyData.name ?? 'company ini'
  const companyUsers = (companyData.company_users || []) as CompanyUserRow[]

  const [assignOpen, setAssignOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<ApiUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>()
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchAllUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const data = await apiFetch<ApiUser[]>('/api/users')
      setAllUsers(Array.isArray(data) ? data : [])
    } catch {
      setAllUsers([])
      message.error('Gagal memuat daftar user')
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (assignOpen) fetchAllUsers()
  }, [assignOpen, fetchAllUsers])

  const assignUserToCompany = async (userId: string) => {
    const u = allUsers.find((x) => x.id === userId)
    if (!u) return
    const oldId = u.company_id || null
    const oldName = u.company?.name || null

    const runPatch = async () => {
      setSaving(true)
      try {
        await apiFetch(`/api/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId }),
        })
        message.success('User ditambahkan ke company')
        setAssignOpen(false)
        setSelectedUserId(undefined)
        router.refresh()
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : 'Gagal menyimpan')
      } finally {
        setSaving(false)
      }
    }

    if (oldId && oldId !== companyId && oldName) {
      const userLabel = u.full_name || u.email || 'User'
      confirmUserCompanyMove({
        userLabel,
        fromCompanyName: oldName,
        toCompanyName: companyName,
        onOk: runPatch,
      })
      return
    }
    await runPatch()
  }

  const removeUserFromCompany = async (userId: string) => {
    setSaving(true)
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: null }),
      })
      message.success('User dihapus dari company')
      router.refresh()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Gagal menghapus')
    } finally {
      setSaving(false)
    }
  }

  const customerCandidates = allUsers.filter((u) => u.role === 'customer')

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAssignOpen(true)}>
          Assign a customer to this company
        </Button>
      </Space>
      <br />

      {companyUsers.length > 0 ? (
        <Descriptions bordered column={1}>
          {companyUsers.map((cu) => (
            <Descriptions.Item
              key={cu.user_id}
              label={cu.users?.full_name || cu.users?.email || 'User'}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexWrap: 'wrap',
                  width: '100%',
                }}
              >
                <Space orientation="vertical" size={2}>
                  <Text>
                    <strong>Email:</strong> {cu.users?.email || 'N/A'}
                  </Text>
                  {(cu.company_role || 'member') === 'company_admin' ? (
                    <Tag color="blue">Portal admin</Tag>
                  ) : null}
                  {viewerIsGlobalAdmin &&
                  (cu.users?.role || '').toLowerCase() === 'customer' ? (
                    <Space size={8} style={{ marginTop: 4 }} align="center">
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Portal admin (manage users)
                      </Text>
                      <Switch
                        size="small"
                        checked={(cu.company_role || 'member') === 'company_admin'}
                        onChange={async (checked) => {
                          try {
                            await apiFetch(`/api/companies/${companyId}/portal-members/${cu.user_id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                company_role: checked ? 'company_admin' : 'member',
                              }),
                            })
                            message.success('Updated')
                            router.refresh()
                          } catch (e: unknown) {
                            message.error(e instanceof Error ? e.message : 'Gagal menyimpan')
                          }
                        }}
                      />
                    </Space>
                  ) : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Added: <DateDisplay date={cu.created_at} />
                  </Text>
                </Space>
                <Space wrap align="center" style={{ marginLeft: 'auto' }}>
                  <SpaNavLink
                    href={`/settings/users/${cu.user_id}`}
                    style={{ color: '#1677ff', fontSize: 14, lineHeight: '22px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <EyeOutlined /> Detail
                  </SpaNavLink>
                  <SpaNavLink
                    href={`/settings/users/${cu.user_id}?edit=1`}
                    style={{ color: '#1677ff', fontSize: 14, lineHeight: '22px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <EditOutlined /> Edit
                  </SpaNavLink>
                  <Popconfirm
                    title="Hapus user dari company ini?"
                    description="Company pada user akan dikosongkan; user tidak dihapus dari sistem."
                    okText="Ya"
                    cancelText="Batal"
                    onConfirm={() => removeUserFromCompany(cu.user_id)}
                  >
                    <Button
                      type="link"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      loading={saving}
                      disabled={saving}
                    >
                      Hapus
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            </Descriptions.Item>
          ))}
        </Descriptions>
      ) : (
        <Text type="secondary">No users assigned to this company</Text>
      )}

      <Modal
        title="Assign customer"
        open={assignOpen}
        onCancel={() => {
          setAssignOpen(false)
          setSelectedUserId(undefined)
        }}
        okText="Simpan"
        confirmLoading={saving}
        onOk={async () => {
          if (!selectedUserId) {
            message.warning('Pilih user')
            return
          }
          await assignUserToCompany(selectedUserId)
        }}
      >
        <Select
          showSearch
          allowClear
          placeholder="Pilih user (role customer)"
          style={{ width: '100%' }}
          loading={loadingUsers}
          optionFilterProp="label"
          value={selectedUserId}
          onChange={setSelectedUserId}
          options={customerCandidates.map((u) => {
            const inThis = u.company_id === companyId
            const extra =
              u.company_id && u.company_id !== companyId
                ? ` — saat ini: ${u.company?.name ?? 'company lain'}`
                : inThis
                  ? ' — sudah di company ini'
                  : ''
            return {
              value: u.id,
              label: `${u.full_name || u.email}${extra}`,
              disabled: inThis,
            }
          })}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          Jika user sudah terdaftar di company lain, akan muncul peringatan pemindahan.
        </Text>
      </Modal>
    </>
  )
}
