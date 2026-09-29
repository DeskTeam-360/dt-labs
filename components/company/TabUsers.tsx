'use client'

import { DeleteOutlined, EditOutlined,EyeOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, message, Modal, Popconfirm, Radio, Select, Space, Switch, Tag, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import { confirmUserCompanyMove } from '@/components/company/confirm-user-company-move'

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
  extra_company_ids?: string[]
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
  const companyName = companyData.name ?? 'this company'
  const companyUsers = (companyData.company_users || []) as CompanyUserRow[]

  const [assignOpen, setAssignOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<ApiUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>()
  const [assignMode, setAssignMode] = useState<'additional' | 'move'>('additional')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchAllUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const data = await apiFetch<ApiUser[]>('/api/users')
      setAllUsers(Array.isArray(data) ? data : [])
    } catch {
      setAllUsers([])
      message.error('Failed to load user list')
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    fetchAllUsers()
  }, [fetchAllUsers])

  const closeAssign = () => {
    setAssignOpen(false)
    setSelectedUserId(undefined)
    setAssignMode('additional')
  }

  const selectedUser = allUsers.find((x) => x.id === selectedUserId)
  const selectedHasOtherPrimary = !!selectedUser?.company_id && selectedUser.company_id !== companyId

  const patchUser = async (userId: string, body: Record<string, unknown>, successMsg: string) => {
    setSaving(true)
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      message.success(successMsg)
      closeAssign()
      await fetchAllUsers()
      router.refresh()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const assignUserToCompany = async (userId: string) => {
    const u = allUsers.find((x) => x.id === userId)
    if (!u) return
    const oldId = u.company_id || null
    const oldName = u.company?.name || 'another company'

    if (oldId && oldId !== companyId && assignMode === 'additional') {
      const extra = [...new Set([...(u.extra_company_ids ?? []), companyId])]
      await patchUser(userId, { extra_company_ids: extra }, `Added ${companyName} as an additional company`)
      return
    }

    const runMove = () => patchUser(userId, { company_id: companyId }, 'User added to company')
    if (oldId && oldId !== companyId) {
      confirmUserCompanyMove({
        userLabel: u.full_name || u.email || 'User',
        fromCompanyName: oldName,
        toCompanyName: companyName,
        onOk: runMove,
      })
      return
    }
    await runMove()
  }

  const removeUserFromCompany = async (userId: string) => {
    const u = allUsers.find((x) => x.id === userId)
    if (u && u.company_id !== companyId && (u.extra_company_ids ?? []).includes(companyId)) {
      await patchUser(
        userId,
        { extra_company_ids: (u.extra_company_ids ?? []).filter((id) => id !== companyId) },
        'Additional company access removed'
      )
      return
    }
    await patchUser(userId, { company_id: null }, 'User removed from company')
  }

  const isAdditionalMember = (userId: string) => {
    const u = allUsers.find((x) => x.id === userId)
    return !!u && u.company_id !== companyId && (u.extra_company_ids ?? []).includes(companyId)
  }

  const customerCandidates = allUsers.filter((u) => u.role === 'customer')

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAssignOpen(true)}>
          Assign a customer to this company
        </Button>
      </Space>

      <Card>
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
                  {isAdditionalMember(cu.user_id) ? (
                    <Tag color="purple">Additional company</Tag>
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
                            message.error(e instanceof Error ? e.message : 'Failed to save')
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
                    title="Remove user from this company?"
                    description="The user's company will be cleared; the user account is not deleted from the system."
                    okText="Yes"
                    cancelText="Cancel"
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
                      Remove
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
      </Card>

      <Modal
        title="Assign customer"
        open={assignOpen}
        onCancel={closeAssign}
        okText="Save"
        confirmLoading={saving}
        onOk={async () => {
          if (!selectedUserId) {
            message.warning('Select a user')
            return
          }
          await assignUserToCompany(selectedUserId)
        }}
      >
        <Select
          showSearch
          allowClear
          placeholder="Select user (customer role)"
          style={{ width: '100%' }}
          loading={loadingUsers}
          optionFilterProp="label"
          value={selectedUserId}
          onChange={setSelectedUserId}
          options={customerCandidates.map((u) => {
            const inThis = u.company_id === companyId || (u.extra_company_ids ?? []).includes(companyId)
            const extra = inThis
              ? ' — already on this company'
              : u.company_id
                ? ` — currently: ${u.company?.name ?? 'another company'}`
                : ''
            return {
              value: u.id,
              label: `${u.full_name || u.email}${extra}`,
              disabled: inThis,
            }
          })}
        />
        {selectedHasOtherPrimary ? (
          <Radio.Group
            value={assignMode}
            onChange={(e) => setAssignMode(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}
          >
            <Radio value="additional">
              Add as an additional company. Keeps them in {selectedUser?.company?.name ?? 'their current company'} and
              lets them see this company&apos;s tickets too.
            </Radio>
            <Radio value="move">
              Move to this company. They will no longer belong to {selectedUser?.company?.name ?? 'their current company'}.
            </Radio>
          </Radio.Group>
        ) : null}
      </Modal>
    </>
  )
}
