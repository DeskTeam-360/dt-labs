'use client'

import { ArrowLeftOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Layout, message, Modal, Select, Space, Tabs, Typography } from 'antd'
import dayjs from 'dayjs'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'
import { SpaNavLink } from '../SpaNavLink'
import styles from './RecapSnapshotsSettingsContent.module.css'

const { Content } = Layout
const { Title, Text } = Typography

type TeamOption = { id: string; name: string }

type RoleBlock = {
  position: string
  time_used_seconds: number
  team_members_with_role: number
  time_available_seconds: number
  time_left_over_seconds: number
  pct_used: number | null
}

type TaskByRole = { position: string; available_tasks: number }

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

function formatHoursFromSeconds(sec: unknown): string {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : 0
  const h = n / 3600
  return `${h.toFixed(2)} h`
}

function hours2(sec: unknown): string {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? sec : 0
  return (n / 3600).toFixed(2)
}

/** Count fields (e.g. distinct clients) — show as whole number. */
function formatIntCount(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return String(Math.trunc(n))
}

const HDR_H = ' (H)'

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

function parseRoles(payload: Record<string, unknown>): RoleBlock[] {
  const raw = payload.by_position
  if (!Array.isArray(raw)) return []
  const out: RoleBlock[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    out.push({
      position: String(o.position ?? ''),
      time_used_seconds: Number(o.time_used_seconds) || 0,
      team_members_with_role: Number(o.team_members_with_role) || 0,
      time_available_seconds: Number(o.time_available_seconds) || 0,
      time_left_over_seconds: Number(o.time_left_over_seconds) || 0,
      pct_used: o.pct_used === null || o.pct_used === undefined ? null : Number(o.pct_used),
    })
  }
  return out
}

function getRole(payload: Record<string, unknown>, position: string): RoleBlock | null {
  return parseRoles(payload).find((r) => r.position === position) ?? null
}

function periodGroupLabel(row: SnapshotGridRow): string {
  if (row.periodType === 'week') {
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

function parseTaskByRole(payload: Record<string, unknown>): TaskByRole[] {
  const raw = payload.available_tasks_by_role
  if (!Array.isArray(raw)) return []
  const out: TaskByRole[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    out.push({
      position: String(o.position ?? ''),
      available_tasks: Number(o.available_tasks) || 0,
    })
  }
  return out
}

function roleUsesSingleTimeUsedColumn(position: string): boolean {
  return position === 'Not in team'
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

  const visibleRows = useMemo(() => grouped.flatMap((g) => g.rows), [grouped])

  const { positionsOrdered, taskRolePositions } = useMemo(() => {
    const pos = new Set<string>()
    const taskPos = new Set<string>()
    for (const row of visibleRows) {
      for (const r of parseRoles(row.payload)) {
        if (r.position) pos.add(r.position)
      }
      for (const t of parseTaskByRole(row.payload)) {
        if (t.position) taskPos.add(t.position)
      }
    }
    const sortPos = (a: string, b: string) => {
      if (a === 'Not in team') return 1
      if (b === 'Not in team') return -1
      return a.localeCompare(b)
    }
    return {
      positionsOrdered: [...pos].sort(sortPos),
      taskRolePositions: [...taskPos].sort(sortPos),
    }
  }, [visibleRows])

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
        <Descriptions.Item label="Total clients">{formatIntCount(p.total_client)}</Descriptions.Item>
        <Descriptions.Item label={`Client time${HDR_H}`}>
          {typeof p.total_client_time_hours === 'number' && Number.isFinite(p.total_client_time_hours)
            ? p.total_client_time_hours.toFixed(2)
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Company log rows">{String(companyLog.row_count ?? '—')}</Descriptions.Item>
        <Descriptions.Item label="Time used (sum)">
          {formatHoursFromSeconds(totals.total_time_used_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Time available (sum)">
          {formatHoursFromSeconds(totals.total_time_available_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Left-over (totals)">
          {formatHoursFromSeconds(totals.total_time_left_over_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Left-over time (client − used)">
          {formatHoursFromSeconds(p.left_over_time_seconds)}
        </Descriptions.Item>
        <Descriptions.Item label="Available tasks (÷4h)">{String(p.available_tasks ?? '—')}</Descriptions.Item>
      </Descriptions>
    )
  }, [detailRow, teamLabel])

  const colCount =
    1 +
    3 +
    positionsOrdered.reduce((acc, p) => acc + (roleUsesSingleTimeUsedColumn(p) ? 1 : 4), 0) +
    3 +
    3 +
    1 +
    taskRolePositions.length +
    1

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
                <div className={styles.scrollWrap}>
                  <table className={styles.grid}>
                    <thead>
                      <tr>
                        <th className={`${styles.th} ${styles.thSticky}`}>Team</th>
                        <th className={styles.th}>Total Team</th>
                        <th className={styles.th}>Total Client</th>
                        <th className={styles.th}>Total Client Time{HDR_H}</th>
                        {positionsOrdered.map((pos) =>
                          roleUsesSingleTimeUsedColumn(pos) ? (
                            <th key={pos} className={styles.th}>
                              {pos} Time Used{HDR_H}
                            </th>
                          ) : (
                            <Fragment key={pos}>
                              <th className={styles.th}>{pos} Time Used{HDR_H}</th>
                              <th className={styles.th}>{pos} Time Available{HDR_H}</th>
                              <th className={styles.th}>{pos} Time Left Over{HDR_H}</th>
                              <th className={styles.th}>{pos} % Used</th>
                            </Fragment>
                          )
                        )}
                        <th className={styles.th}>Total Time Used{HDR_H}</th>
                        <th className={styles.th}>Total Time Available{HDR_H}</th>
                        <th className={styles.th}>Total Time Left Over{HDR_H}</th>
                        <th className={styles.th}>Left over time{HDR_H}</th>
                        <th className={styles.th}>Left over per day{HDR_H}</th>
                        <th className={styles.th}>Available Tasks</th>
                        {taskRolePositions.map((pos) => (
                          <th key={`at-${pos}`} className={styles.th}>
                            Available Tasks - {pos}
                          </th>
                        ))}
                        <th className={styles.th} style={{ width: 88 }}>
                          {' '}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((g) => (
                        <Fragment key={g.periodKey}>
                          <tr>
                            <td className={styles.monthBar} colSpan={colCount}>
                              {g.label}
                            </td>
                          </tr>
                          {g.rows.map((row) => {
                            const p = row.payload
                            const totals =
                              p.totals && typeof p.totals === 'object' ? (p.totals as Record<string, unknown>) : {}
                            const tasksByPos = new Map(
                              parseTaskByRole(p).map((t) => [t.position, t.available_tasks])
                            )
                            return (
                              <tr key={row.id}>
                                <td className={`${styles.tdStrong} ${styles.tdSticky}`}>{rowTeamDisplay(row)}</td>
                                <td className={styles.td}>{String(p.total_team ?? '—')}</td>
                                <td className={styles.td}>{formatIntCount(p.total_client)}</td>
                                <td className={styles.tdNum}>
                                  {typeof p.total_client_time_hours === 'number'
                                    ? p.total_client_time_hours.toFixed(2)
                                    : '—'}
                                </td>
                                {positionsOrdered.map((pos) => {
                                  const role = getRole(p, pos)
                                  if (roleUsesSingleTimeUsedColumn(pos)) {
                                    return (
                                      <td key={pos} className={styles.tdNum}>
                                        {role ? hours2(role.time_used_seconds) : '—'}
                                      </td>
                                    )
                                  }
                                  if (!role) {
                                    return (
                                      <Fragment key={`${row.id}-${pos}`}>
                                        <td className={styles.tdNum}>—</td>
                                        <td className={styles.tdNum}>—</td>
                                        <td className={styles.tdNum}>—</td>
                                        <td className={styles.tdNum}>—</td>
                                      </Fragment>
                                    )
                                  }
                                  const pct =
                                    role.pct_used === null || role.pct_used === undefined
                                      ? '—'
                                      : `${Number(role.pct_used).toFixed(2)}%`
                                  return (
                                    <Fragment key={`${row.id}-${pos}`}>
                                      <td className={styles.tdNum}>{hours2(role.time_used_seconds)}</td>
                                      <td className={styles.tdNum}>{hours2(role.time_available_seconds)}</td>
                                      <td className={styles.tdNum}>{hours2(role.time_left_over_seconds)}</td>
                                      <td className={styles.tdNum}>{pct}</td>
                                    </Fragment>
                                  )
                                })}
                                <td className={styles.tdNum}>{hours2(totals.total_time_used_seconds)}</td>
                                <td className={styles.tdNum}>{hours2(totals.total_time_available_seconds)}</td>
                                <td className={styles.tdNum}>{hours2(totals.total_time_left_over_seconds)}</td>
                                <td className={styles.tdNum}>{hours2(p.left_over_time_seconds)}</td>
                                <td className={styles.tdNum}>{hours2(p.left_over_per_day_seconds)}</td>
                                <td className={styles.tdNum}>
                                  {typeof p.available_tasks === 'number'
                                    ? Number(p.available_tasks).toFixed(2)
                                    : '—'}
                                </td>
                                {taskRolePositions.map((pos) => (
                                  <td key={`${row.id}-at-${pos}`} className={styles.tdNum}>
                                    {tasksByPos.has(pos) ? Number(tasksByPos.get(pos)).toFixed(2) : '—'}
                                  </td>
                                ))}
                                <td className={styles.td}>
                                  <Button
                                    type="link"
                                    size="small"
                                    icon={<EyeOutlined />}
                                    onClick={() => void openDetail(row.id)}
                                  >
                                    View
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </Space>
        </Content>
      </AdminMainColumn>

      <Modal
        title={detailRow?.title ?? 'Recap detail'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailOpen(false)}>
            Close
          </Button>,
        ]}
        width={720}
        destroyOnHidden
      >
        {detailLoading ? (
          <Text type="secondary">Loading…</Text>
        ) : detailRow ? (
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
        ) : null}
      </Modal>
    </Layout>
  )
}
