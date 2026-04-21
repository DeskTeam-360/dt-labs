'use client'

import { EditOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Form,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

const { RangePicker } = DatePicker
const { Text, Paragraph } = Typography

type Row = {
  id: string
  snapshot_date: string
  active_team_id: string | null
  active_manager_id: string | null
  active_team_name: string | null
  active_manager_display: string | null
  active_time: number
  created_at: string
}

type UserOption = { id: string; full_name: string | null; email: string; role: string }
type TeamOption = { id: string; name: string }

interface TabCompanyLogProps {
  companyId: string
  /** Page already authorized (e.g. /settings/company-log): always show add/edit even if GET omits can_manage */
  forceCanManage?: boolean
  /** `full` = use full main-column width (Settings Company Log page) */
  layout?: 'default' | 'full'
}

function UuidCell({ v }: { v: string | null }) {
  if (!v) return <Text type="secondary">—</Text>
  return (
    <Text code copyable={{ text: v }} style={{ fontSize: 11, wordBreak: 'break-all' }}>
      {v}
    </Text>
  )
}

export default function TabCompanyLog({ companyId, forceCanManage, layout = 'default' }: TabCompanyLogProps) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const end = dayjs().startOf('day')
    const start = end.subtract(89, 'day')
    return [start, end]
  })
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [metaFrom, setMetaFrom] = useState('')
  const [metaTo, setMetaTo] = useState('')
  const [canManage, setCanManage] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [managerOptions, setManagerOptions] = useState<UserOption[]>([])
  const [form] = Form.useForm<{
    snapshot_date: Dayjs
    active_team_id?: string | null
    active_manager_id?: string | null
    active_time: number
  }>()

  const loadSelectOptions = useCallback(async () => {
    try {
      const [usersRes, teamsRes] = await Promise.all([
        fetch('/api/users', { credentials: 'include' }),
        fetch('/api/teams', { credentials: 'include' }),
      ])
      const usersBody = await usersRes.json().catch(() => [])
      const teamsBody = await teamsRes.json().catch(() => [])
      if (usersRes.ok && Array.isArray(usersBody)) {
        setManagerOptions(
          (usersBody as UserOption[]).filter((u) => (u.role || '').toLowerCase() !== 'customer' && !!u.email),
        )
      } else {
        setManagerOptions([])
      }
      if (teamsRes.ok && Array.isArray(teamsBody)) {
        setTeamOptions((teamsBody as TeamOption[]).map((t) => ({ id: t.id, name: t.name })))
      } else {
        setTeamOptions([])
      }
    } catch {
      setManagerOptions([])
      setTeamOptions([])
    }
  }, [])

  const fetchData = useCallback(async () => {
    const from = range[0].format('YYYY-MM-DD')
    const to = range[1].format('YYYY-MM-DD')
    setLoading(true)
    try {
      const res = await fetch(
        `/api/companies/${companyId}/daily-active-assignments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: 'include' }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || res.statusText || 'Failed to load')
      }
      setRows(Array.isArray(body.data) ? body.data : [])
      setMetaFrom(body.from ?? from)
      setMetaTo(body.to ?? to)
      setCanManage(Boolean(body.can_manage))
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load Company Log')
      setRows([])
      setCanManage(false)
    } finally {
      setLoading(false)
    }
  }, [companyId, range])

  const allowManage = Boolean(forceCanManage) || canManage

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const openAdd = async () => {
    await loadSelectOptions()
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({
      snapshot_date: dayjs().startOf('day'),
      active_team_id: undefined,
      active_manager_id: undefined,
      active_time: 0,
    })
    setModalOpen(true)
  }

  const openEdit = async (record: Row) => {
    await loadSelectOptions()
    setEditingId(record.id)
    form.setFieldsValue({
      snapshot_date: record.snapshot_date ? dayjs(record.snapshot_date) : dayjs(),
      active_team_id: record.active_team_id ?? undefined,
      active_manager_id: record.active_manager_id ?? undefined,
      active_time: record.active_time ?? 0,
    })
    setModalOpen(true)
  }

  const handleModalOk = async () => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const snapshotDate = v.snapshot_date.format('YYYY-MM-DD')
      const payload = {
        active_team_id: v.active_team_id ?? null,
        active_manager_id: v.active_manager_id ?? null,
        active_time: v.active_time ?? 0,
      }
      if (editingId) {
        const res = await fetch(`/api/companies/${companyId}/daily-active-assignments/${editingId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || res.statusText || 'Update failed')
        message.success('Company Log entry updated')
      } else {
        const res = await fetch(`/api/companies/${companyId}/daily-active-assignments`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot_date: snapshotDate, ...payload }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || res.statusText || 'Save failed')
        message.success('Company Log entry saved')
      }
      setModalOpen(false)
      await fetchData()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<Row> = [
    {
      title: 'Snapshot date (UTC)',
      dataIndex: 'snapshot_date',
      key: 'snapshot_date',
      width: 132,
      render: (d: string) => (d ? <Text code>{d}</Text> : '—'),
    },
   
    {
      title: 'Team (resolved)',
      dataIndex: 'active_team_name',
      key: 'active_team_name',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Account Manager (resolved)',
      dataIndex: 'active_manager_display',
      key: 'active_manager_display',
      width: 180,
      ellipsis: true,
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'active_time (raw)',
      dataIndex: 'active_time',
      key: 'active_time',
      width: 200,
      render: (h: number) => <Text code>{h ?? 0}</Text>,
    },
    {
      title: 'created_at (raw)',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 220,
      render: (iso: string) =>
        iso ? (
          <Text code copyable={{ text: iso }} style={{ fontSize: 11, wordBreak: 'break-all' }}>
            {iso}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    ...(allowManage
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 88,
            fixed: 'right' as const,
            render: (_: unknown, record: Row) => (
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openEdit(record)}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ]

  const isFull = layout === 'full'

  return (
    <Card
      size="small"
      style={isFull ? { width: '100%', maxWidth: '100%' } : undefined}
      styles={isFull ? { body: { paddingBlock: 16 } } : undefined}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: '100%' }}>
        <div>
          <Space align="center" wrap>
            <FileTextOutlined style={{ fontSize: 20, color: 'var(--ant-color-primary, #1677ff)' }} />
            <Text strong style={{ fontSize: 16 }}>
              Company Log
            </Text>
          </Space>
          <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8, fontSize: 13 }}>
            Table <Text code>company_daily_active_assignments</Text>: one row per UTC calendar day per company — raw
            UUIDs and values plus resolved team/manager names. Cron fills from <Text code>companies.active_*</Text>;
            range {metaFrom && metaTo ? `${metaFrom} … ${metaTo}` : 'selected'} (max 500 rows, max 366 days).
            {allowManage ? ' You can add or edit rows below.' : ''}
          </Paragraph>
        </div>
        <Space wrap>
          <RangePicker
            value={range}
            onChange={(v) => {
              if (v?.[0] && v[1]) setRange([v[0].startOf('day'), v[1].startOf('day')])
            }}
            allowClear={false}
          />
          <Button type="primary" onClick={() => void fetchData()} loading={loading}>
            Refresh
          </Button>
          {allowManage ? (
            <Button type="default" icon={<PlusOutlined />} onClick={() => void openAdd()}>
              Add log entry
            </Button>
          ) : null}
        </Space>
        <Table<Row>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={isFull ? { x: 'max-content' } : { x: 1400 }}
          tableLayout={isFull ? 'auto' : undefined}
          style={isFull ? { width: '100%' } : undefined}
        />

        <Modal
          title={editingId ? 'Edit Company Log entry' : 'Add Company Log entry'}
          open={modalOpen}
          onOk={() => void handleModalOk()}
          onCancel={() => setModalOpen(false)}
          confirmLoading={saving}
          destroyOnHidden
          width={520}
        >
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item
              name="snapshot_date"
              label="snapshot_date (UTC)"
              rules={[{ required: true, message: 'Required' }]}
            >
              <DatePicker style={{ width: '100%' }} disabled={!!editingId} />
            </Form.Item>
            <Form.Item name="active_team_id" label="active_team_id">
              <Select
                allowClear
                showSearch
                placeholder="Team UUID"
                optionFilterProp="label"
                options={teamOptions.map((t) => ({ value: t.id, label: t.name }))}
              />
            </Form.Item>
            <Form.Item name="active_manager_id" label="active_manager_id">
              <Select
                allowClear
                showSearch
                placeholder="Non-customer user"
                optionFilterProp="label"
                options={managerOptions.map((u) => ({
                  value: u.id,
                  label: `${u.full_name || u.email} (${u.email})`,
                }))}
              />
            </Form.Item>
            <Form.Item name="active_time" label="active_time">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} addonAfter="H" />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </Card>
  )
}
