'use client'

import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Layout, message, Space, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '../AdminMainColumn'
import AdminSidebar from '../AdminSidebar'
import { SpaNavLink } from '../SpaNavLink'

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

type WeekCol = {
  week_start: string
  week_end: string
  iso_year: number
  iso_week: number
  header?: string
  label: string
}

type Cell = {
  is_embedded: boolean
  client_time_hours: number
  tracker_reported_seconds: number
  utilization_percent: number | null
}

type GridRow = {
  company_id: string
  company_name: string
  any_embedded: boolean
  cells: Record<string, Cell>
}

type TeamGrid = {
  team: { id: string; name: string }
  rows: GridRow[]
}

interface CustomerWeeklyRecapSettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

function cellBackground(embedded: boolean, pct: number | null | undefined): string {
  if (!embedded) return 'var(--ant-color-fill-secondary, #e8e8e8)'
  if (pct == null) return '#fff'
  if (pct >= 100) return '#ffd8a8'
  if (pct >= 70) return '#fff7d6'
  if (pct <= 0) return '#ffc6c6'
  return '#fff'
}

function TeamWeeklyTable({ weeksDisplay, rows }: { weeksDisplay: WeekCol[]; rows: GridRow[] }) {
  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          fontSize: 12,
          minWidth: 200 + weeksDisplay.length * 112,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 2,
                background: 'var(--ant-color-primary, #1677ff)',
                color: '#fff',
                padding: '10px 12px',
                textAlign: 'left',
                borderBottom: '1px solid #fff',
                minWidth: 200,
              }}
            >
              Customer
            </th>
            {weeksDisplay.map((w) => (
              <th
                key={w.week_start}
                style={{
                  background: 'var(--ant-color-primary, #1677ff)',
                  color: '#fff',
                  padding: '8px 6px',
                  textAlign: 'center',
                  borderLeft: '1px solid rgba(255,255,255,0.25)',
                  minWidth: 108,
                  maxWidth: 140,
                  fontWeight: 600,
                }}
                title={w.label}
              >
               {w.iso_year} {w.header ?? `${w.iso_year} W${w.iso_week}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.company_id}>
              <td
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  background: '#fff',
                  padding: '8px 12px',
                  borderBottom: '1px solid #f0f0f0',
                  fontWeight: r.any_embedded ? 600 : 400,
                  color: r.any_embedded ? undefined : 'var(--ant-color-text-secondary)',
                }}
              >
                {r.company_name}
              </td>
              {weeksDisplay.map((w) => {
                const cell = r.cells[w.week_start]
                const embedded = cell?.is_embedded ?? false
                const pct = cell?.utilization_percent
                return (
                  <td
                    key={w.week_start}
                    style={{
                      textAlign: 'center',
                      padding: '6px 4px',
                      borderBottom: '1px solid #f0f0f0',
                      borderLeft: '1px solid #f0f0f0',
                      background: cellBackground(embedded, pct),
                    }}
                  >
                    {embedded ? (pct != null ? `${pct.toFixed(1)}%` : '—') : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CustomerWeeklyRecapSettingsContent({ user: currentUser }: CustomerWeeklyRecapSettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const end = dayjs().endOf('day')
    const start = end.subtract(12, 'week').startOf('isoWeek').startOf('day')
    return [start, end]
  })
  const [loading, setLoading] = useState(false)
  const [materializing, setMaterializing] = useState(false)
  const [weeks, setWeeks] = useState<WeekCol[]>([])
  const [teamGrids, setTeamGrids] = useState<TeamGrid[]>([])

  const weeksDisplay = useMemo(() => [...weeks].reverse(), [weeks])

  const loadGrid = useCallback(async () => {
    if (!range[0] || !range[1]) {
      setWeeks([])
      setTeamGrids([])
      return
    }
    setLoading(true)
    try {
      const from = range[0].format('YYYY-MM-DD')
      const to = range[1].format('YYYY-MM-DD')
      const qs = new URLSearchParams({ from, to })
      const res = await fetch(`/api/reports/customer-weekly-recap?${qs}`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      setWeeks(Array.isArray(body.weeks) ? body.weeks : [])
      const grids = Array.isArray(body.team_grids) ? body.team_grids : []
      if (grids.length > 0) {
        setTeamGrids(
          grids.map((g: { team?: { id: string; name?: string }; rows?: GridRow[] }) => ({
            team: { id: String(g.team?.id ?? ''), name: String(g.team?.name ?? g.team?.id ?? '') },
            rows: Array.isArray(g.rows) ? g.rows : [],
          }))
        )
      } else if (body.team && Array.isArray(body.rows)) {
        setTeamGrids([{ team: { id: String(body.team.id), name: String(body.team.name ?? body.team.id) }, rows: body.rows }])
      } else {
        setTeamGrids([])
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load grid')
      setWeeks([])
      setTeamGrids([])
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void loadGrid()
  }, [loadGrid])

  const runMaterialize = useCallback(async () => {
    if (!range[0] || !range[1]) {
      message.warning('Select a date range.')
      return
    }
    setMaterializing(true)
    try {
      const res = await fetch('/api/reports/customer-weekly-recap/materialize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: range[0].format('YYYY-MM-DD'),
          to: range[1].format('YYYY-MM-DD'),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || res.statusText)
      const teamsN = body.teams_processed ?? 1
      message.success(
        `Snapshots updated: ${teamsN} team(s), ${body.weeksProcessed ?? 0} team-week(s), ${body.cellsWritten ?? 0} cell(s) written.`
      )
      await loadGrid()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Materialize failed')
    } finally {
      setMaterializing(false)
    }
  }, [range, loadGrid])

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
                Recap Customer Weekly
              </Title>
              <Text type="secondary">
                All teams are shown at once (one grid per team). Each cell is a materialized snapshot from Company Log
                plus support ticket time. Gray cells = not embedded with that team in that week. Active customers are
                sorted above inactive ones. Use <Text strong>Materialize all teams</Text> to rebuild cells for the
                selected range, or schedule <Text code>POST /api/cron/customer-weekly-recap</Text>.
              </Text>
            </div>

            <Card size="small" title="Date range">
              <Space wrap align="center" size="middle">
                <RangePicker value={range} onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])} />
                <Button type="primary" icon={<ReloadOutlined />} loading={materializing} onClick={() => void runMaterialize()}>
                  Materialize all teams
                </Button>
                <Button loading={loading} onClick={() => void loadGrid()}>
                  Refresh view
                </Button>
              </Space>
            </Card>

            {loading ? (
              <Card size="small">
                <div style={{ padding: 32 }}>
                  <Text type="secondary">Loading…</Text>
                </div>
              </Card>
            ) : teamGrids.length === 0 ? (
              <Card size="small">
                <div style={{ padding: 32 }}>
                  <Text type="secondary">
                    No snapshot data for this range yet. Run Materialize after Company Log has entries for the relevant
                    days.
                  </Text>
                </div>
              </Card>
            ) : (
              teamGrids.map((g) => (
                <Card key={g.team.id} size="small" title={`${g.team.name}`} styles={{ body: { padding: 0 } }}>
                  {g.rows.length === 0 ? (
                    <div style={{ padding: 24 }}>
                      <Text type="secondary">No cells saved for this team in this range yet.</Text>
                    </div>
                  ) : (
                    <TeamWeeklyTable weeksDisplay={weeksDisplay} rows={g.rows} />
                  )}
                </Card>
              ))
            )}
          </Space>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
