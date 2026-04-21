'use client'

import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Input,
  Layout,
  message,
  Modal,
  Select,
  Space,
  Tabs,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  RECAP_HDR_H,
  recapFormatHoursFromSeconds,
  recapFormatIntCount,
} from '@/lib/recap-payload-grid'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'
import { RecapSnapshotPayloadGridTable } from '../recap/RecapSnapshotPayloadGridTable'
import { SpaNavLink } from '../SpaNavLink'

const { Content } = Layout
const { Title, Text } = Typography

type TeamOption = { id: string; name: string }

type SnapshotGridRow = {
  id: string
  title: string
  periodStart: string
  periodEnd: string
  periodType: string
  teamIds: string[]
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
  createdBy: string | null
  creatorEmail: string | null
  creatorFullName: string | null
}

interface RecapSnapshotsSettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** Kunci stabil untuk Select: recap tanpa judul. */
const EMPTY_TITLE_KEY = '__empty_title__'

function titleKey(row: SnapshotGridRow): string {
  const t = row.title.trim()
  return t.length > 0 ? t : EMPTY_TITLE_KEY
}

function titleLabelFromKey(key: string): string {
  return key === EMPTY_TITLE_KEY ? '(Tanpa judul)' : key
}

function normalizeTeamIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x ?? '').trim()).filter(Boolean)
}

function periodGroupLabel(row: SnapshotGridRow): string {
  const pt = row.periodType
  if (pt === 'week' || pt === 'custom') {
    const a = dayjs(row.periodStart)
    const b = dayjs(row.periodEnd)
    if (a.isValid() && b.isValid()) {
      return `${a.format('MMM D')} – ${b.format('MMM D, YYYY')}`
    }
  }
  const d = dayjs(row.periodStart)
  return d.isValid() ? d.format('MMMM YYYY') : `${row.periodStart} – ${row.periodEnd}`
}

function periodSortKey(row: SnapshotGridRow): number {
  const d = dayjs(row.periodEnd || row.periodStart)
  return d.isValid() ? d.valueOf() : 0
}

export default function RecapSnapshotsSettingsContent({ user: currentUser }: RecapSnapshotsSettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<SnapshotGridRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  /** Empty = tampilkan semua judul. Nilai = `titleKey` (judul unik atau placeholder tanpa judul). */
  const [selectedTitleKeys, setSelectedTitleKeys] = useState<string[]>([])
  const [teamsById, setTeamsById] = useState<Record<string, string>>({})
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailEditing, setDetailEditing] = useState(false)
  const [detailSaveLoading, setDetailSaveLoading] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editPayloadJson, setEditPayloadJson] = useState('')
  const [detailRow, setDetailRow] = useState<{
    id: string
    title: string
    periodStart: string
    periodEnd: string
    periodType: string
    teamIds: string[]
    payload: Record<string, unknown>
    createdAt: string
    updatedAt: string
  } | null>(null)

  const loadTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams', { credentials: 'include' })
      const body = await res.json().catch(() => [])
      if (!res.ok || !Array.isArray(body)) return
      const map: Record<string, string> = {}
      for (const t of body as TeamOption[]) {
        if (t?.id) map[t.id] = t.name || t.id
      }
      setTeamsById(map)
    } catch {
      setTeamsById({})
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/recap-snapshots?limit=200&offset=0&include_payload=1', {
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      const raw = Array.isArray(body.data) ? body.data : []
      setRows(
        raw.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          title: String(r.title ?? ''),
          periodStart: String(r.periodStart ?? r.period_start ?? ''),
          periodEnd: String(r.periodEnd ?? r.period_end ?? ''),
          periodType: String(r.periodType ?? r.period_type ?? ''),
          teamIds: normalizeTeamIds(r.teamIds ?? r.team_ids),
          payload:
            typeof r.payload === 'object' && r.payload !== null ? (r.payload as Record<string, unknown>) : {},
          createdAt: String(r.createdAt ?? r.created_at ?? ''),
          updatedAt: String(r.updatedAt ?? r.updated_at ?? ''),
          createdBy: r.createdBy != null ? String(r.createdBy) : null,
          creatorEmail: r.creatorEmail != null ? String(r.creatorEmail) : null,
          creatorFullName: r.creatorFullName != null ? String(r.creatorFullName) : null,
        }))
      )
      setTotal(typeof body.total === 'number' ? body.total : 0)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load recaps')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTeams()
    void loadList()
  }, [loadList, loadTeams])

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true)
    setDetailEditing(false)
    setDetailLoading(true)
    setDetailRow(null)
    try {
      const res = await fetch(`/api/reports/recap-snapshots/${id}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      const d = body.data
      if (!d || typeof d !== 'object') throw new Error('Invalid response')
      setDetailRow({
        id: String(d.id),
        title: String(d.title ?? ''),
        periodStart: String(d.periodStart ?? d.period_start ?? ''),
        periodEnd: String(d.periodEnd ?? d.period_end ?? ''),
        periodType: String(d.periodType ?? d.period_type ?? ''),
        teamIds: Array.isArray(d.teamIds) ? d.teamIds.map(String) : Array.isArray(d.team_ids) ? d.team_ids.map(String) : [],
        payload: typeof d.payload === 'object' && d.payload !== null ? (d.payload as Record<string, unknown>) : {},
        createdAt: String(d.createdAt ?? d.created_at ?? ''),
        updatedAt: String(d.updatedAt ?? d.updated_at ?? ''),
      })
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load recap')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const beginDetailEdit = useCallback(() => {
    if (!detailRow) return
    setEditTitle(detailRow.title)
    setEditPayloadJson(JSON.stringify(detailRow.payload, null, 2))
    setDetailEditing(true)
  }, [detailRow])

  const cancelDetailEdit = useCallback(() => {
    setDetailEditing(false)
  }, [])

  const saveDetailEdit = useCallback(async () => {
    if (!detailRow) return
    const t = editTitle.trim()
    if (!t) {
      message.warning('Judul tidak boleh kosong')
      return
    }
    let parsed: Record<string, unknown>
    try {
      const raw = JSON.parse(editPayloadJson) as unknown
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        message.error('Payload harus berupa objek JSON (bukan array atau primitif).')
        return
      }
      parsed = raw as Record<string, unknown>
    } catch {
      message.error('JSON payload tidak valid.')
      return
    }
    setDetailSaveLoading(true)
    try {
      const res = await fetch(`/api/reports/recap-snapshots/${detailRow.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, payload: parsed }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string })?.error || res.statusText)
      const d = (body as { data?: Record<string, unknown> }).data
      if (!d || typeof d !== 'object') throw new Error('Invalid response')
      const next: NonNullable<typeof detailRow> = {
        id: String(d.id),
        title: String(d.title ?? ''),
        periodStart: String(d.periodStart ?? d.period_start ?? ''),
        periodEnd: String(d.periodEnd ?? d.period_end ?? ''),
        periodType: String(d.periodType ?? d.period_type ?? ''),
        teamIds: Array.isArray(d.teamIds)
          ? d.teamIds.map(String)
          : Array.isArray(d.team_ids)
            ? d.team_ids.map(String)
            : [],
        payload: typeof d.payload === 'object' && d.payload !== null ? (d.payload as Record<string, unknown>) : {},
        createdAt: String(d.createdAt ?? d.created_at ?? ''),
        updatedAt: String(d.updatedAt ?? d.updated_at ?? ''),
      }
      setDetailRow(next)
      setRows((prev) =>
        prev.map((r) =>
          r.id === next.id
            ? {
                ...r,
                title: next.title,
                payload: next.payload,
                updatedAt: next.updatedAt,
              }
            : r
        )
      )
      message.success('Perubahan disimpan')
      setDetailEditing(false)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setDetailSaveLoading(false)
    }
  }, [detailRow, editTitle, editPayloadJson])

  const closeDetailModal = useCallback(() => {
    setDetailOpen(false)
    setDetailEditing(false)
  }, [])

  const teamLabel = useCallback(
    (ids: string[]) => {
      if (!ids?.length) return '—'
      return ids.map((id) => teamsById[id] || id).join(', ')
    },
    [teamsById]
  )

  const rowTeamDisplay = useCallback(
    (row: SnapshotGridRow) => {
      const names = Array.isArray(row.payload.team_names)
        ? (row.payload.team_names as unknown[]).map((x) => String(x)).filter(Boolean)
        : []
      if (names.length) return names.join(', ')
      if (row.title.trim()) return row.title.trim()
      return teamLabel(row.teamIds)
    },
    [teamLabel]
  )

  const rowsFilteredByTitle = useMemo(() => {
    if (selectedTitleKeys.length === 0) return rows
    const pick = new Set(selectedTitleKeys)
    return rows.filter((r) => pick.has(titleKey(r)))
  }, [rows, selectedTitleKeys])

  useEffect(() => {
    const valid = new Set(rows.map((r) => titleKey(r)))
    setSelectedTitleKeys((prev) => prev.filter((k) => valid.has(k)))
  }, [rows])

  const titleSelectOptions = useMemo(() => {
    const keys = [...new Set(rows.map(titleKey))]
    keys.sort((a, b) => titleLabelFromKey(a).localeCompare(titleLabelFromKey(b)))
    return keys.map((value) => ({ value, label: titleLabelFromKey(value) }))
  }, [rows])

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; sortKey: number; rows: SnapshotGridRow[] }>()
    for (const row of rowsFilteredByTitle) {
      const label = periodGroupLabel(row)
      const key = `${row.periodStart}|${row.periodEnd}|${row.periodType}`
      const existing = map.get(key)
      const sk = periodSortKey(row)
      if (existing) {
        existing.rows.push(row)
        existing.sortKey = Math.max(existing.sortKey, sk)
      } else {
        map.set(key, { label, sortKey: sk, rows: [row] })
      }
    }
    const groups = [...map.entries()].map(([periodKey, g]) => ({
      periodKey,
      ...g,
      rows: [...g.rows].sort((a, b) => (a.title || '').localeCompare(b.title || '')),
    }))
    groups.sort((a, b) => b.sortKey - a.sortKey)
    return groups
  }, [rowsFilteredByTitle])

  const gridSections = useMemo(
    () =>
      grouped.map((g) => ({
        groupLabel: g.label,
        rows: g.rows.map((row) => ({
          key: row.id,
          payload: row.payload,
          teamColumnLabel: rowTeamDisplay(row),
        })),
      })),
    [grouped, rowTeamDisplay]
  )

  const summaryTab = useMemo(() => {
    if (!detailRow) return null
    const p = detailRow.payload
    const teamNames = Array.isArray(p.team_names) ? (p.team_names as string[]).join(', ') : teamLabel(detailRow.teamIds)
    const totals = p.totals && typeof p.totals === 'object' ? (p.totals as Record<string, unknown>) : {}
    const companyLog =
      p.company_log && typeof p.company_log === 'object' ? (p.company_log as Record<string, unknown>) : {}

    return (
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Title">{detailRow.title}</Descriptions.Item>
        <Descriptions.Item label="Period">
          {detailRow.periodStart} → {detailRow.periodEnd} ({detailRow.periodType})
        </Descriptions.Item>
        <Descriptions.Item label="Teams">{teamNames}</Descriptions.Item>
        <Descriptions.Item label="Total clients">{recapFormatIntCount(p.total_client)}</Descriptions.Item>
        <Descriptions.Item label={`Client time${RECAP_HDR_H}`}>
          {typeof p.total_client_time_hours === 'number' && Number.isFinite(p.total_client_time_hours)
            ? p.total_client_time_hours.toFixed(2)
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Company log rows">{String(companyLog.row_count ?? '—')}</Descriptions.Item>
        <Descriptions.Item label="Time used (sum)">
          {recapFormatHoursFromSeconds(totals.total_time_used_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Time available (sum)">
          {recapFormatHoursFromSeconds(totals.total_time_available_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Left-over (totals)">
          {recapFormatHoursFromSeconds(totals.total_time_left_over_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Left-over time (client − used)">
          {recapFormatHoursFromSeconds(p.left_over_time_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Available tasks (÷4h)">
          {typeof p.available_tasks === 'number' && Number.isFinite(p.available_tasks)
            ? Number(p.available_tasks).toFixed(2)
            : '—'}
        </Descriptions.Item>
      </Descriptions>
    )
  }, [detailRow, teamLabel])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{
          ...currentUser,
          role: currentUser.role ?? undefined,
        }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, margin: '0 auto', width: '100%' }}>
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/settings">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>
                  Back to Settings
                </Button>
              </SpaNavLink>
              <Title level={2} style={{ margin: '8px 0 0' }}>
                Recap snapshots
              </Title>
              <Text type="secondary">
                Ringkasan tersimpan dari Customer time report — grup periode seperti lembar rekap. {total} total.
              </Text>
            </div>

            {!loading && rows.length > 0 && (
              <Card size="small">
                <Space wrap align="center" size="middle">
                  <Text strong>Judul recap</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="Semua judul"
                    style={{ minWidth: 320, maxWidth: '100%' }}
                    options={titleSelectOptions}
                    value={selectedTitleKeys}
                    onChange={(v) => setSelectedTitleKeys(v ?? [])}
                    maxTagCount="responsive"
                    optionFilterProp="label"
                  />
                  <Text type="secondary">
                    {selectedTitleKeys.length === 0
                      ? `${rows.length} baris · ${grouped.length} grup periode`
                      : `${rowsFilteredByTitle.length} baris · ${grouped.length} grup periode`}
                  </Text>
                </Space>
              </Card>
            )}

            <Card styles={{ body: { padding: 0 } }}>
              {loading ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Text type="secondary">Memuat…</Text>
                </div>
              ) : rows.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Text type="secondary">Belum ada recap yang disimpan.</Text>
                </div>
              ) : grouped.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Text type="secondary">
                    Tidak ada data untuk judul yang dipilih. Kosongkan filter untuk melihat semua.
                  </Text>
                </div>
              ) : (
                <RecapSnapshotPayloadGridTable
                  sections={gridSections}
                  showActionColumn
                  onViewRow={(id) => void openDetail(id)}
                />
              )}
            </Card>
          </Space>
        </Content>
      </AdminMainColumn>

      <Modal
        title={detailEditing ? 'Ubah recap' : detailRow?.title || 'Recap detail'}
        open={detailOpen}
        onCancel={closeDetailModal}
        footer={
          detailEditing
            ? [
                <Button key="cancel" onClick={cancelDetailEdit}>
                  Batal
                </Button>,
                <Button
                  key="save"
                  type="primary"
                  loading={detailSaveLoading}
                  onClick={() => void saveDetailEdit()}
                >
                  Simpan
                </Button>,
              ]
            : [
                <Button key="close" onClick={closeDetailModal}>
                  Tutup
                </Button>,
                <Button key="edit" type="primary" disabled={!detailRow || detailLoading} onClick={beginDetailEdit}>
                  Ubah judul & payload
                </Button>,
              ]
        }
        width={detailEditing ? 920 : 720}
        destroyOnHidden
      >
        {detailLoading ? (
          <Text type="secondary">Loading…</Text>
        ) : detailRow ? (
          detailEditing ? (
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Text strong>Judul</Text>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={500}
                  showCount
                  placeholder="Judul recap"
                  style={{ marginTop: 8 }}
                />
              </div>
              <div>
                <Text strong>Payload (JSON)</Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                  Objek JSON penuh seperti yang disimpan. Salah sintaks atau bukan objek akan ditolak.
                </Text>
                <Input.TextArea
                  value={editPayloadJson}
                  onChange={(e) => setEditPayloadJson(e.target.value)}
                  spellCheck={false}
                  autoSize={{ minRows: 14, maxRows: 28 }}
                  style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </Space>
          ) : (
            <Tabs
              items={[
                { key: 'summary', label: 'Summary', children: summaryTab },
                {
                  key: 'json',
                  label: 'Raw JSON',
                  children: (
                    <pre
                      style={{
                        maxHeight: 420,
                        overflow: 'auto',
                        fontSize: 12,
                        margin: 0,
                        padding: 12,
                        background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
                        borderRadius: 8,
                      }}
                    >
                      {JSON.stringify(detailRow.payload, null, 2)}
                    </pre>
                  ),
                },
              ]}
            />
          )
        ) : null}
      </Modal>
    </Layout>
  )
}
