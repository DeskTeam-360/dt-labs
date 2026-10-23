'use client'

import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { DndContext, type DragEndEvent, DragOverlay, type DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Alert, Badge, Button, Empty, Flex, Input, Layout, message, Modal, Popover, Select, Space, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { DEFAULT_ALL_STATUS_COLUMNS, type TicketRecord } from '@/components/ticket/list/types'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography

/** Only tickets still waiting for or in work are on the board. */
const BOARD_STATUSES = 'open,received,working_team'
const GREEN = '#52c41a'
/** True for a moment after a drag ends, so releasing the card does not follow its link. */
let justDragged = false
/** "No assign" shows at most this many tickets; agent lanes always show everything they have. */
const NO_ASSIGN_LIMIT = 50

type CompanyOption = { id: string; name: string; is_customer?: boolean; plan_hours: number; spent_hours: number; has_active_timer: boolean }
type Agent = { id: string; name: string; position: string | null; shift_id: string | null }
type ShiftOption = { id: string; title: string; start: string; end: string; crosses_midnight: boolean }
type Lane = { key: string; title: string; subtitle?: string; tickets: TicketRecord[]; total?: number }
type Match = { tickets: Record<string, { has_skills: boolean; users: Record<string, number> }>; load: Record<string, number> }
type Active = { ticket_id: number; title: string; company: string | null; since: string }
type PersonStatus = {
  reason: string | null
  capacity_hours: number | null
  shift_start: string | null
  shift_end: string | null
  tracked_seconds: number
  active: Active[]
}

const agentLabel = (a: Agent) => (a.position ? `${a.name} - ${a.position}` : a.name)

/** Leave / duty information from Team Availability. */
const DUTY: Record<string, { label: string; color: string }> = {
  work: { label: 'On duty', color: 'blue' },
  piket: { label: 'On call (piket)', color: 'purple' },
  leave: { label: 'On leave', color: 'red' },
  sick: { label: 'Sick', color: 'red' },
  holiday: { label: 'Holiday', color: 'default' },
  weekend: { label: 'Weekend', color: 'default' },
  other: { label: 'Off', color: 'default' },
  not_employed: { label: 'Not employed', color: 'default' },
}

const wibTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : null

const fmtDur = (sec: number) => {
  const m = Math.round(sec / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

async function fetchTickets(params: Record<string, string>): Promise<TicketRecord[]> {
  const qs = new URLSearchParams({ limit: '200', ...params })
  const res = await fetch(`/api/tickets?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load tickets')
  const data = await res.json()
  return (Array.isArray(data) ? data : (data.data ?? [])) as TicketRecord[]
}

async function fetchTicketsPage(params: Record<string, string>): Promise<{ items: TicketRecord[]; total: number }> {
  const qs = new URLSearchParams({ paginated: '1', ...params })
  const res = await fetch(`/api/tickets?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load tickets')
  const data = await res.json()
  const items = (Array.isArray(data) ? data : (data.data ?? [])) as TicketRecord[]
  return { items, total: Array.isArray(data) ? items.length : Number(data.total ?? items.length) }
}

function StatusChip({ status }: { status: string }) {
  const col = DEFAULT_ALL_STATUS_COLUMNS.find((c) => c.id === status)
  return (
    <Tag style={{ margin: 0, backgroundColor: col?.color ?? '#d9d9d9', color: '#262626', border: 'none', fontWeight: 600 }}>
      {col?.title ?? status}
    </Tag>
  )
}

/** One ticket. Short on purpose: the rest shows on hover. */
function TicketCard({ t, stat, hint, highlight }: { t: TicketRecord; stat?: TicketTrackerStat; hint?: React.ReactNode; highlight?: boolean }) {
  const active = stat?.active_trackers ?? []
  const isActive = active.length > 0

  const detail = (
    <Flex vertical gap={6} style={{ width: 320 }}>
      <Text strong>#{t.id} {t.title}</Text>
      <Text type="secondary">{[t.company?.name, t.type?.title, t.team_name].filter(Boolean).join(' · ') || 'No company'}</Text>
      <Text>Assigned to: {(t.assignees ?? []).map((a) => a.user_name).filter(Boolean).join(', ') || 'nobody'}</Text>
      <Text>Last update: {dayjs(t.updated_at).fromNow()} <Text type="secondary">({dayjs(t.updated_at).format('MMM DD, HH:mm')})</Text></Text>
      <Text>Created: {dayjs(t.created_at).format('MMM DD, YYYY HH:mm')}</Text>
      <Text>Due: {t.due_date ? dayjs(t.due_date).format('MMM DD, YYYY') : '—'}</Text>
      <Text>Tracked today: {fmtDur(stat?.today_seconds ?? 0)}</Text>
      {isActive ? <Text style={{ color: GREEN, fontWeight: 600 }}>Timer: {active.map((a) => a.user_name).join(', ')}</Text> : null}
      {(t.tags ?? []).length > 0 ? (
        <Flex gap={4} wrap>{t.tags!.map((g) => <Tag key={g.id} style={{ margin: 0 }}>{g.name}</Tag>)}</Flex>
      ) : null}
    </Flex>
  )

  return (
    <Popover content={detail} placement="right" mouseEnterDelay={0.35}>
      <a
        href={`/tickets/${t.id}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (justDragged) e.preventDefault()
        }}
        draggable={false}
        style={{
          display: 'block',
          flexShrink: 0,
          color: 'inherit',
          textDecoration: 'none',
          borderRadius: 10,
          overflow: 'hidden',
          background: isActive ? '#f6ffed' : 'var(--kanban-card-bg, #fff)',
          border: isActive ? `2px solid ${GREEN}` : highlight ? '2px solid #1677ff' : '1px solid var(--kanban-card-border, #e8e8e8)',
          boxShadow: isActive ? `0 0 0 3px rgba(82,196,26,0.18)` : highlight ? '0 0 0 3px rgba(22,119,255,0.18)' : undefined,
        }}
      >
        {isActive ? (
          <div style={{ background: GREEN, color: '#fff', fontWeight: 700, fontSize: 12, padding: '3px 10px' }}>
            ● Timer active · {active.map((a) => a.user_name.split(' ')[0]).join(', ')}
          </div>
        ) : null}
        <div style={{ padding: '8px 10px' }}>
          <Flex justify="space-between" align="center" gap={6}>
            <Flex gap={6} align="center">
              <Text type="secondary" style={{ fontSize: 12 }}>#{t.id}</Text>
              <StatusChip status={t.status} />
            </Flex>
            {t.priority != null && t.priority > 0 ? <Tag style={{ margin: 0 }}>P{t.priority}</Tag> : null}
          </Flex>
          <Text strong style={{ marginTop: 4, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {t.title}
          </Text>
          {t.company?.name ? <Text type="secondary" style={{ fontSize: 12 }}>{t.company.name}</Text> : null}
          {hint ? <div style={{ marginTop: 6 }}>{hint}</div> : null}
        </div>
      </a>
    </Popover>
  )
}

/** Top of a person's lane: who, duty/leave, shift, and where they are working right now. */
function PersonHeader({ lane, agent, shift, status, count }: { lane: Lane; agent?: Agent; shift?: ShiftOption; status?: PersonStatus; count: number }) {
  const duty = status?.reason ? DUTY[status.reason] ?? { label: status.reason, color: 'default' } : null
  const active = status?.active ?? []
  const start = wibTime(status?.shift_start ?? null)
  const trackerText = start ? `${start} – ${active.length ? 'now' : wibTime(status?.shift_end ?? null)}` : 'Not started yet'
  const shiftLabel = shift ? `${shift.title} (${shift.start} - ${shift.end}${shift.crosses_midnight ? ' +1' : ''})` : 'not set'

  const detail = (
    <Flex vertical gap={4} style={{ width: 280 }}>
      <Text strong>{lane.title}{agent?.position ? ` · ${agent.position}` : ''}</Text>
      <Text>Today: {duty?.label ?? 'no availability data'}{status?.capacity_hours != null ? ` (${status.capacity_hours} h planned)` : ''}</Text>
      <Text>Shift: {shiftLabel} WIB</Text>
      <Text>Seen from the tracker today: {trackerText}</Text>
      <Text>Tracked today: {fmtDur(status?.tracked_seconds ?? 0)}</Text>
      <Text>Open tickets: {count}</Text>
      {active.map((a) => (
        <Text key={a.ticket_id} style={{ color: GREEN, fontWeight: 600 }}>
          Working on #{a.ticket_id} {a.company ? `(${a.company})` : ''} since {wibTime(a.since)}
        </Text>
      ))}
    </Flex>
  )

  const isActive = active.length > 0
  return (
    <Popover content={detail} placement="bottom" mouseEnterDelay={0.35}>
      <div
        style={{
          borderRadius: 12,
          padding: '10px 12px',
          background: isActive ? '#f6ffed' : 'var(--kanban-column-bg, #fafafa)',
          border: isActive ? `2px solid ${GREEN}` : '1px solid #e8e8e8',
        }}
      >
        <Flex justify="space-between" align="center" gap={6}>
          <Text style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Text strong style={{ fontSize: 14 }}>{lane.title.split(' ')[0]}</Text>
            {lane.subtitle ? <Text type="secondary" style={{ fontSize: 11 }}> · {lane.subtitle}</Text> : null}
          </Text>
          <Tag color={duty?.color ?? 'default'} style={{ margin: 0, flexShrink: 0 }}>
            {duty ? `${duty.label}: ${count}` : count}
          </Tag>
        </Flex>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>Shift: {shift?.title ?? 'not set'}</Text>
        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tracked today: <Text strong style={{ fontSize: 12 }}>{fmtDur(status?.tracked_seconds ?? 0)}</Text></Text>
      </div>
    </Popover>
  )
}

/** A ticket card that can be dragged to another lane. */
function DraggableTicket({ laneKey, t, children }: { laneKey: string; t: TicketRecord; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${laneKey}:${t.id}`, data: { ticketId: t.id, fromLane: laneKey } })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'none', flexShrink: 0 }}>
      {children}
    </div>
  )
}

/** One lane: a bordered column that accepts dropped tickets. */
function LaneColumn({ laneKey, isPool, children }: { laneKey: string; isPool: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: laneKey })
  return (
    <div
      ref={setNodeRef}
      style={{
        width: 316,
        flexShrink: 0,
        padding: 8,
        borderRadius: 16,
        border: isOver ? '2px dashed #1677ff' : isPool ? '2px solid #ffc069' : '2px solid #d0d7de',
        background: isOver ? '#e6f4ff' : isPool ? '#fffaf0' : 'var(--kanban-column-bg, #f5f6f8)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {children}
    </div>
  )
}

export default function TeamPoolContent({ user: currentUser }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [shifts, setShifts] = useState<ShiftOption[]>([])
  const [everyone, setEveryone] = useState<Record<string, PersonStatus>>({})
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [agentIds, setAgentIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [lanes, setLanes] = useState<Lane[]>([])
  const [stats, setStats] = useState<Map<number, TicketTrackerStat>>(new Map())
  const [match, setMatch] = useState<Match | null>(null)
  const [people, setPeople] = useState<Record<string, PersonStatus>>({})
  const [notFound, setNotFound] = useState(false)
  const [dragging, setDragging] = useState<TicketRecord | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [searchNote, setSearchNote] = useState('')

  useEffect(() => {
    fetch('/api/board/company-load', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { companies: [] }))
      .then((j: { companies?: CompanyOption[] }) => setCompanies(j.companies ?? []))
      .catch(() => setCompanies([]))
    fetch('/api/shifts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ShiftOption[]) => setShifts(Array.isArray(rows) ? rows : []))
      .catch(() => setShifts([]))
    fetch('/api/users', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; full_name?: string | null; email: string; position?: string | null; role?: string | null; status?: string | null; shift_id?: string | null }[]) =>
        setAgents(
          (Array.isArray(rows) ? rows : [])
            .filter((u) => ['admin', 'manager', 'staff'].includes((u.role ?? '').toLowerCase()) && (u.status ?? 'active') === 'active')
            .map((u) => ({ id: u.id, name: u.full_name || u.email, position: u.position ?? null, shift_id: u.shift_id ?? null }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => setAgents([]))
  }, [])

  useEffect(() => {
    if (agents.length === 0) return
    fetch(`/api/board/people-status?user_ids=${agents.map((a) => a.id).join(',')}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { people: {} }))
      .then((j: { people?: Record<string, PersonStatus> }) => setEveryone(j.people ?? {}))
      .catch(() => setEveryone({}))
  }, [agents])

  /** Quick select: everyone with the same position, or on the same shift, in one click. */
  const quickGroups = useMemo(() => {
    const build = (keyOf: (a: Agent) => string | null) => {
      const m = new Map<string, string[]>()
      for (const a of agents) {
        const k = keyOf(a)
        if (!k) continue
        const list = m.get(k) ?? []
        list.push(a.id)
        m.set(k, list)
      }
      return [...m.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([label, ids]) => ({ label, ids }))
    }
    return {
      positions: build((a) => a.position?.trim() || null),
      shifts: build((a) => shifts.find((x) => x.id === a.shift_id)?.title ?? null),
    }
  }, [agents, shifts])

  /** Adds the whole group to the selection, or removes it again when every member is already selected. */
  const toggleGroup = (ids: string[]) =>
    setAgentIds((cur) => (ids.every((id) => cur.includes(id)) ? cur.filter((id) => !ids.includes(id)) : [...new Set([...cur, ...ids])]))

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const idSearch = activeSearch.replace(/\D/g, '')
      const baseStatus: Record<string, string> = { status: BOARD_STATUSES, sort_by: 'priority', sort_order: 'asc' }
      const pool: Lane = { key: 'unassigned', title: 'No assign', tickets: [], total: 0 }
      const personIds = [...agentIds]
      let highlight: number | null = null
      setSearchNote('')

      if (idSearch) {
        // A ticket search only touches "No assign" (the ticket if nobody has it) and adds the owner's lane.
        const found = await fetchTickets({ search: idSearch, search_by: 'id' })
        const t = found.find((x) => String(x.id) === idSearch)
        if (!t) {
          setNotFound(true)
        } else {
          highlight = t.id
          const owners = t.assignees ?? []
          if (owners.length === 0) {
            pool.tickets = [t]
            pool.total = 1
            setSearchNote(`Ticket ${t.id} has no assignee.`)
          } else {
            for (const a of owners) if (!personIds.includes(a.user_id)) personIds.push(a.user_id)
            setSearchNote(`Ticket ${t.id} is assigned to ${owners.map((a) => a.user_name).filter(Boolean).join(', ')}. It is highlighted in their column.`)
          }
        }
      } else {
        const base = { ...baseStatus }
        if (companyIds.length) base.company_ids = companyIds.join(',')
        const page = await fetchTicketsPage({ ...base, unassigned: '1', limit: String(NO_ASSIGN_LIMIT) })
        pool.tickets = page.items
        pool.total = page.total
      }

      // Agent lanes are never narrowed by the company filter or the ticket search: they show everything the person has.
      const assigned = personIds.length ? await fetchTickets({ ...baseStatus, assignee_ids: personIds.join(',') }) : []
      const persons: Lane[] = personIds.map((id) => {
        const ag = agentById.get(id)
        const mine = assigned.filter((t) => (t.assignees ?? []).some((a) => a.user_id === id))
        // The searched ticket goes to the top of the lane.
        mine.sort((x, y) => Number(y.id === highlight) - Number(x.id === highlight))
        return { key: id, title: ag?.name ?? 'Agent', subtitle: ag?.position ?? undefined, tickets: mine }
      })
      // Lightest workload sits next to "No assign", the busiest person is furthest right.
      persons.sort((x, y) => x.tickets.length - y.tickets.length || x.title.localeCompare(y.title))

      const out: Lane[] = [pool, ...persons]
      const all: TicketRecord[] = [...pool.tickets, ...assigned]
      setHighlightId(highlight)
      setLanes(out)
      const ticketIds = [...new Set(all.map((t) => t.id))]

      if (ticketIds.length) {
        fetch(`/api/tickets/ticket-time-stats?ticket_ids=${ticketIds.join(',')}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: TicketTrackerStat[]) => setStats(new Map(rows.map((r) => [r.ticket_id, r]))))
          .catch(() => setStats(new Map()))
      } else {
        setStats(new Map())
      }
      if (ticketIds.length && personIds.length) {
        fetch(`/api/board/skill-match?ticket_ids=${ticketIds.join(',')}&user_ids=${personIds.join(',')}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: Match | null) => setMatch(j))
          .catch(() => setMatch(null))
      } else {
        setMatch(null)
      }
      if (personIds.length) {
        fetch(`/api/board/people-status?user_ids=${personIds.join(',')}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : { people: {} }))
          .then((j: { people?: Record<string, PersonStatus> }) => setPeople(j.people ?? {}))
          .catch(() => setPeople({}))
      } else {
        setPeople({})
      }
    } catch (e) {
      message.error((e as Error).message)
      setLanes([])
    } finally {
      setLoading(false)
    }
  }, [companyIds, agentIds, activeSearch, agentById])

  // Reload whenever a filter changes (agents must be known first so lane titles are right).
  useEffect(() => {
    if (agents.length === 0 && agentIds.length > 0) return
    void load()
  }, [load, agents.length, agentIds.length])

  const rank = (t: TicketRecord) => (t.id === highlightId ? 2 : (stats.get(t.id)?.active_trackers.length ?? 0) > 0 ? 1 : 0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  /** Drop a ticket on a lane: assign it to that person (moving it away from the person it came from). */
  const moveTicket = useCallback(
    async (ticketId: number, fromKey: string, toKey: string) => {
      if (fromKey === toKey) return
      const source = lanes.find((l) => l.key === fromKey)
      const t = source?.tickets.find((x) => x.id === ticketId)
      if (!t) return
      const current = (t.assignees ?? []).map((a) => a.user_id)
      const next = [
        ...new Set([...(toKey === 'unassigned' ? [] : [toKey]), ...current.filter((id) => id !== fromKey && id !== toKey)]),
      ]
      const names = new Map((t.assignees ?? []).map((a) => [a.user_id, a.user_name]))
      const nextAssignees = next.map((id) => ({ id: '', user_id: id, user_name: agentById.get(id)?.name ?? names.get(id) }))

      const previous = lanes
      setLanes((ls) =>
        ls.map((l) => {
          if (l.key === fromKey && l.key !== toKey) {
            return { ...l, tickets: l.tickets.filter((x) => x.id !== ticketId), total: l.total != null ? Math.max(0, l.total - 1) : l.total }
          }
          if (l.key === toKey) {
            const moved = { ...t, assignees: nextAssignees }
            return { ...l, tickets: [moved, ...l.tickets.filter((x) => x.id !== ticketId)], total: l.total != null ? l.total + 1 : l.total }
          }
          return l
        })
      )
      try {
        const res = await fetch(`/api/tickets/${ticketId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignees: next }),
        })
        if (!res.ok) throw new Error('Could not change the assignee')
        message.success(toKey === 'unassigned' ? `#${ticketId} is unassigned` : `#${ticketId} assigned to ${agentById.get(toKey)?.name ?? 'the agent'}`)
      } catch (e) {
        setLanes(previous)
        message.error((e as Error).message)
      }
    },
    [lanes, agentById]
  )

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { ticketId: number; fromLane: string } | undefined
    setDragging(lanes.find((l) => l.key === d?.fromLane)?.tickets.find((x) => x.id === d?.ticketId) ?? null)
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    justDragged = true
    setTimeout(() => {
      justDragged = false
    }, 150)
    const d = e.active.data.current as { ticketId: number; fromLane: string } | undefined
    const to = e.over?.id ? String(e.over.id) : null
    if (!d || !to || to === d.fromLane) return
    if (to === 'unassigned') {
      const from = agentById.get(d.fromLane)?.name ?? 'this person'
      Modal.confirm({
        title: `Remove #${d.ticketId} from ${from}?`,
        content: 'The ticket goes back to No assign.',
        okText: 'Unassign',
        onOk: () => moveTicket(d.ticketId, d.fromLane, to),
      })
      return
    }
    void moveTicket(d.ticketId, d.fromLane, to)
  }

  /** Under a "No assign" ticket: the best people for it (100% first, then lightest workload, then higher match). */
  const bestFit = (t: TicketRecord) => {
    const m = match?.tickets[String(t.id)]
    if (!m?.has_skills) return null
    const load = (id: string) => match?.load[id] ?? 0
    const best = Object.entries(m.users)
      .filter(([, pct]) => pct >= 50)
      .sort(([ia, pa], [ib, pb]) => Number(pb === 100) - Number(pa === 100) || load(ia) - load(ib) || pb - pa)
      .slice(0, 3)
    if (best.length === 0) return <Text type="secondary" style={{ fontSize: 12 }}>No one here matches 50% of the skills</Text>
    return (
      <Flex gap={4} wrap align="center">
        <Text type="secondary" style={{ fontSize: 12 }}>Best fit:</Text>
        {best.map(([id, pct]) => (
          <Tag key={id} color={pct === 100 ? 'green' : 'gold'} style={{ margin: 0 }}>
            {(agentById.get(id)?.name ?? 'Agent').split(' ')[0]} {pct}%
          </Tag>
        ))}
      </Flex>
    )
  }

  /** Under a ticket in a person's lane: how well it fits them. */
  const fitFor = (t: TicketRecord, userId: string) => {
    const m = match?.tickets[String(t.id)]
    const pct = m?.has_skills ? m.users[userId] : undefined
    if (pct == null) return null
    return <Tag color={pct === 100 ? 'green' : pct >= 50 ? 'gold' : 'default'} style={{ margin: 0 }}>Skill match {pct}%</Tag>
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...currentUser, role: currentUser.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <SpaNavLink href="/tickets">
                <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>Back to Tickets</Button>
              </SpaNavLink>
              <Title level={2} style={{ margin: '8px 0 0' }}>Team Pool</Title>
              <Text type="secondary">Unassigned tickets next to the people you pick. Hover a card for details.</Text>
            </div>

            <Flex gap={12} wrap align="flex-end">
              <div style={{ minWidth: 280, flex: 1 }}>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  placeholder="Company: pick to load No assign"
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                  value={companyIds}
                  onChange={setCompanyIds}
                  disabled={!!activeSearch}
                  filterOption={(input, option) => String(option?.name ?? '').toLowerCase().includes(input.toLowerCase())}
                  options={companies.map((c) => ({ value: c.id, name: c.name, label: c.name, company: c }))}
                  optionRender={(o) => {
                    const c = (o.data as { company: CompanyOption }).company
                    return (
                      <Flex justify="space-between" align="center" gap={8}>
                        <span>
                          {c.name} <Text type="secondary">({c.spent_hours}H/{c.plan_hours}H)</Text>
                          {c.is_customer === false ? <Text type="secondary" italic> · internal</Text> : null}
                        </span>
                        {c.has_active_timer ? <Badge color={GREEN} title="A timer is running" /> : null}
                      </Flex>
                    )
                  }}
                />
              </div>
              <div style={{ minWidth: 280, flex: 1 }}>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Agents: pick people to show"
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                  value={agentIds}
                  onChange={setAgentIds}
                  options={agents.map((a) => ({ value: a.id, label: agentLabel(a), agent: a }))}
                  optionRender={(o) => {
                    const a = (o.data as { agent: Agent }).agent
                    const st = everyone[a.id]
                    const duty = st?.reason ? DUTY[st.reason] ?? { label: st.reason, color: 'default' } : null
                    const shift = shifts.find((x) => x.id === a.shift_id)
                    const started = wibTime(st?.shift_start ?? null)
                    const working = st?.reason === 'work' || st?.reason === 'piket'
                    return (
                      <Flex justify="space-between" align="center" gap={8}>
                        <span>{agentLabel(a)}</span>
                        <Flex gap={4} align="center">
                          {shift ? <Tag color="geekblue" style={{ margin: 0 }}>{shift.title}</Tag> : null}
                          {duty ? <Tag color={duty.color} style={{ margin: 0 }}>{duty.label}</Tag> : null}
                          {working ? (
                            started ? (
                              <Text style={{ fontSize: 12, color: GREEN }}>in {started}</Text>
                            ) : (
                              <Text type="secondary" style={{ fontSize: 12 }}>not in yet</Text>
                            )
                          ) : null}
                        </Flex>
                      </Flex>
                    )
                  }}
                />
              </div>
              <Input.Search
                allowClear
                style={{ width: 220 }}
                placeholder="Ticket ID, e.g. #52387"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  if (!e.target.value.trim()) setActiveSearch('')
                }}
                onSearch={(v) => setActiveSearch(v.trim())}
              />
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Reload</Button>
            </Flex>

            {quickGroups.positions.length + quickGroups.shifts.length > 0 ? (
              <Flex gap={6} wrap align="center">
                <Text type="secondary" style={{ fontSize: 12 }}>Quick select:</Text>
                {quickGroups.positions.map((g) => (
                  <Tag.CheckableTag key={`p-${g.label}`} checked={g.ids.every((id) => agentIds.includes(id))} onChange={() => toggleGroup(g.ids)}>
                    {g.label} ({g.ids.length})
                  </Tag.CheckableTag>
                ))}
                {quickGroups.positions.length > 0 && quickGroups.shifts.length > 0 ? <Text type="secondary">|</Text> : null}
                {quickGroups.shifts.map((g) => (
                  <Tag.CheckableTag key={`s-${g.label}`} checked={g.ids.every((id) => agentIds.includes(id))} onChange={() => toggleGroup(g.ids)}>
                    Shift {g.label} ({g.ids.length})
                  </Tag.CheckableTag>
                ))}
                {agentIds.length > 0 ? (
                  <Button type="link" size="small" onClick={() => setAgentIds([])}>Clear</Button>
                ) : null}
              </Flex>
            ) : null}

            {notFound ? <Alert type="info" showIcon title={`Ticket ${activeSearch} was not found.`} /> : null}
            {activeSearch && !notFound && searchNote ? <Alert type="info" showIcon title={searchNote} /> : null}
          </Space>

          <Spin spinning={loading}>
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, overflowX: 'auto', paddingTop: 16, paddingBottom: 12 }}>
                {lanes.map((lane) => {
                  const isPool = lane.key === 'unassigned'
                  return (
                    <LaneColumn key={lane.key} laneKey={lane.key} isPool={isPool}>
                      {isPool ? (
                        <div style={{ borderRadius: 12, padding: '10px 12px', background: '#fff7e6', border: '1px solid #ffd591' }}>
                          <Flex justify="space-between" align="center">
                            <Text strong style={{ fontSize: 15 }}>{lane.title}</Text>
                            <Badge count={lane.total ?? lane.tickets.length} showZero overflowCount={9999} style={{ backgroundColor: '#fa8c16', boxShadow: 'none' }} />
                          </Flex>
                          {lane.total != null && lane.total > lane.tickets.length ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>Showing the first {lane.tickets.length} of {lane.total}. Pick a company to narrow.</Text>
                          ) : null}
                        </div>
                      ) : (
                        <PersonHeader
                          lane={lane}
                          agent={agentById.get(lane.key)}
                          shift={shifts.find((x) => x.id === agentById.get(lane.key)?.shift_id)}
                          status={people[lane.key]}
                          count={lane.tickets.length}
                        />
                      )}
                      <Flex vertical gap={8} style={{ marginTop: 10, minHeight: 80, maxHeight: 'calc(100vh - 380px)', overflowY: 'auto', paddingRight: 2 }}>
                        {lane.tickets.length === 0 ? (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets. Drop a ticket here." />
                        ) : (
                          [...lane.tickets]
                            // The searched ticket first, then tickets with a running timer (whatever their priority), then the rest.
                            .sort((x, y) => rank(y) - rank(x))
                            .map((t) => (
                            <DraggableTicket key={`${lane.key}-${t.id}`} laneKey={lane.key} t={t}>
                              <TicketCard
                                t={t}
                                stat={stats.get(t.id)}
                                hint={isPool ? bestFit(t) : fitFor(t, lane.key)}
                                highlight={t.id === highlightId}
                              />
                            </DraggableTicket>
                          ))
                        )}
                      </Flex>
                    </LaneColumn>
                  )
                })}
              </div>
              <DragOverlay>
                {dragging ? (
                  <div style={{ width: 290, padding: '8px 10px', borderRadius: 10, background: '#fff', border: '2px solid #1677ff', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>#{dragging.id}</Text>
                    <Text strong style={{ display: 'block' }}>{dragging.title}</Text>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </Spin>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
