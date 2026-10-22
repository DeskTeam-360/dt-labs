'use client'

import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { DndContext } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Alert, Badge, Button, Card, Empty, Flex, Input, Layout, message, Select, Space, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import KanbanCard from '@/components/ticket/list/KanbanCard'
import { DEFAULT_ALL_STATUS_COLUMNS, type TicketRecord } from '@/components/ticket/list/types'

const { Content } = Layout
const { Title, Text } = Typography

/** Only tickets still waiting for or in work are on the board. */
const BOARD_STATUSES = 'open,received,working_team'

type CompanyOption = { id: string; name: string; plan_hours: number; spent_hours: number; has_active_timer: boolean }
type Agent = { id: string; name: string; position: string | null }
type Match = { tickets: Record<string, { has_skills: boolean; users: Record<string, number> }>; load: Record<string, number> }
type Column = { key: string; title: string; subtitle?: string; color: string; tickets: TicketRecord[] }

const agentLabel = (a: Agent) => (a.position ? `${a.name} - ${a.position}` : a.name)

async function fetchTickets(params: Record<string, string>): Promise<TicketRecord[]> {
  const qs = new URLSearchParams({ limit: '200', ...params })
  const res = await fetch(`/api/tickets?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load tickets')
  const data = await res.json()
  return (Array.isArray(data) ? data : (data.data ?? [])) as TicketRecord[]
}

export default function TeamPoolContent({ user: currentUser }: { user: { id: string; email?: string | null; name?: string | null; role?: string | null } }) {
  const [collapsed, setCollapsed] = useState(false)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [agentIds, setAgentIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [columns, setColumns] = useState<Column[]>([])
  const [stats, setStats] = useState<Map<number, TicketTrackerStat>>(new Map())
  const [match, setMatch] = useState<Match | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch('/api/board/company-load', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { companies: [] }))
      .then((j: { companies?: CompanyOption[] }) => setCompanies(j.companies ?? []))
      .catch(() => setCompanies([]))
    fetch('/api/users', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; full_name?: string | null; email: string; position?: string | null; role?: string | null; status?: string | null }[]) =>
        setAgents(
          (Array.isArray(rows) ? rows : [])
            .filter((u) => ['admin', 'manager', 'staff'].includes((u.role ?? '').toLowerCase()) && (u.status ?? 'active') === 'active')
            .map((u) => ({ id: u.id, name: u.full_name || u.email, position: u.position ?? null }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch(() => setAgents([]))
  }, [])

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const cols: Column[] = []
      let all: TicketRecord[] = []
      const idSearch = activeSearch.replace(/\D/g, '')

      if (idSearch) {
        // One ticket: show it in "No assign" or in the column of whoever has it, whatever the other filters say.
        const found = await fetchTickets({ search: idSearch, search_by: 'id' })
        const t = found.find((x) => String(x.id) === idSearch)
        if (!t) {
          setNotFound(true)
        } else {
          all = [t]
          const assignees = t.assignees ?? []
          if (assignees.length === 0) {
            cols.push({ key: 'unassigned', title: 'No assign', color: '#faad14', tickets: [t] })
          } else {
            for (const a of assignees) {
              const ag = agentById.get(a.user_id)
              cols.push({ key: a.user_id, title: ag?.name ?? a.user_name ?? 'Agent', subtitle: ag?.position ?? undefined, color: '#91caff', tickets: [t] })
            }
          }
        }
      } else {
        const base: Record<string, string> = { status: BOARD_STATUSES, sort_by: 'priority', sort_order: 'asc' }
        if (companyIds.length) base.company_ids = companyIds.join(',')
        const [unassigned, assigned] = await Promise.all([
          fetchTickets({ ...base, unassigned: '1' }),
          agentIds.length ? fetchTickets({ ...base, assignee_ids: agentIds.join(',') }) : Promise.resolve([] as TicketRecord[]),
        ])
        cols.push({ key: 'unassigned', title: 'No assign', color: '#faad14', tickets: unassigned })
        for (const id of agentIds) {
          const ag = agentById.get(id)
          cols.push({
            key: id,
            title: ag?.name ?? 'Agent',
            subtitle: ag?.position ?? undefined,
            color: '#91caff',
            tickets: assigned.filter((t) => (t.assignees ?? []).some((a) => a.user_id === id)),
          })
        }
        // Lightest workload sits next to "No assign", the busiest person is furthest right.
        const [first, ...people] = cols
        people.sort((x, y) => x.tickets.length - y.tickets.length || x.title.localeCompare(y.title))
        cols.length = 0
        cols.push(first, ...people)
        all = [...unassigned, ...assigned]
      }

      setColumns(cols)
      const ids = [...new Set(all.map((t) => t.id))]
      if (ids.length) {
        fetch(`/api/tickets/ticket-time-stats?ticket_ids=${ids.join(',')}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: TicketTrackerStat[]) => setStats(new Map(rows.map((r) => [r.ticket_id, r]))))
          .catch(() => setStats(new Map()))
      } else {
        setStats(new Map())
      }

      // Skill match between each ticket and the people on the board (people = every column except No assign).
      const personIds = cols.filter((c) => c.key !== 'unassigned').map((c) => c.key)
      if (ids.length && personIds.length) {
        fetch(`/api/board/skill-match?ticket_ids=${ids.join(',')}&user_ids=${personIds.join(',')}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: Match | null) => setMatch(j))
          .catch(() => setMatch(null))
      } else {
        setMatch(null)
      }
    } catch (e) {
      message.error((e as Error).message)
      setColumns([])
    } finally {
      setLoading(false)
    }
  }, [companyIds, agentIds, activeSearch, agentById])

  // Reload whenever a filter changes (agents must be known first so column titles are right).
  useEffect(() => {
    if (agents.length === 0 && agentIds.length > 0) return
    void load()
  }, [load, agents.length, agentIds.length])

  /** Under a "No assign" card: the best people for it (100% first, then lightest workload, then higher match). */
  const bestFit = (t: TicketRecord) => {
    const m = match?.tickets[String(t.id)]
    if (!m?.has_skills) return null
    const load = (id: string) => match?.load[id] ?? 0
    const people = Object.entries(m.users)
      .filter(([, pct]) => pct >= 50)
      .sort(([ia, pa], [ib, pb]) => Number(pb === 100) - Number(pa === 100) || load(ia) - load(ib) || pb - pa)
      .slice(0, 3)
    if (people.length === 0) return <Text type="secondary" style={{ fontSize: 12 }}>No one on the board matches 50% of the skills</Text>
    return (
      <Flex gap={4} wrap align="center">
        <Text type="secondary" style={{ fontSize: 12 }}>Best fit:</Text>
        {people.map(([id, pct]) => (
          <Tag key={id} color={pct === 100 ? 'green' : 'gold'} style={{ margin: 0 }}>
            {(agentById.get(id)?.name ?? 'Agent').split(' ')[0]} {pct}%
          </Tag>
        ))}
      </Flex>
    )
  }

  /** Under a card inside a person's column: how well the ticket fits that person. */
  const fitFor = (t: TicketRecord, userId: string) => {
    const m = match?.tickets[String(t.id)]
    if (!m?.has_skills) return null
    const pct = m.users[userId]
    if (pct == null) return null
    return (
      <Tag color={pct === 100 ? 'green' : pct >= 50 ? 'gold' : 'default'} style={{ margin: 0 }}>
        Skill match {pct}%
      </Tag>
    )
  }

  /** The ticket's current status (the board columns are people, so the card has to say it). */
  const statusTag = (t: TicketRecord) => {
    const col = DEFAULT_ALL_STATUS_COLUMNS.find((c) => c.id === t.status)
    return (
      <Tag style={{ margin: 0, backgroundColor: col?.color ?? '#d9d9d9', color: '#262626', border: 'none', fontWeight: 600 }}>
        {col?.title ?? t.status}
      </Tag>
    )
  }

  const openTicket = (t: TicketRecord) => window.open(`/tickets/${t.id}`, '_blank', 'noopener')

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
              <Text type="secondary">
                Tickets nobody has taken yet, next to the people you pick. Only Open, Received and Working Team tickets are shown.
              </Text>
            </div>

            <Card size="small">
              <Flex gap={12} wrap align="flex-end">
                <div style={{ minWidth: 300, flex: 1 }}>
                  <Text strong>Company</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    placeholder="All companies"
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
                            {c.name}{' '}
                            <Text type="secondary">({c.spent_hours}H/{c.plan_hours}H)</Text>
                          </span>
                          {c.has_active_timer ? <Badge color="#52c41a" title="A timer is running" /> : null}
                        </Flex>
                      )
                    }}
                  />
                </div>
                <div style={{ minWidth: 300, flex: 1 }}>
                  <Text strong>Agents</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Pick people to show next to No assign"
                    style={{ width: '100%' }}
                    maxTagCount="responsive"
                    value={agentIds}
                    onChange={setAgentIds}
                    disabled={!!activeSearch}
                    options={agents.map((a) => ({ value: a.id, label: agentLabel(a) }))}
                  />
                </div>
                <div style={{ minWidth: 220 }}>
                  <Text strong>Search by ticket ID</Text>
                  <Input.Search
                    allowClear
                    placeholder="e.g. 52387 or #52387"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      if (!e.target.value.trim()) setActiveSearch('')
                    }}
                    onSearch={(v) => setActiveSearch(v.trim())}
                  />
                </div>
                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Reload</Button>
              </Flex>
            </Card>

            {notFound ? <Alert type="info" showIcon title={`Ticket ${activeSearch} was not found.`} /> : null}
            {activeSearch && !notFound ? (
              <Alert type="info" showIcon title={`Showing ticket ${activeSearch} only. Clear the search to see the board again.`} />
            ) : null}
          </Space>

          <DndContext>
            <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingTop: 16, paddingBottom: 8 }}>
              {columns.map((col) => (
                <div key={col.key} style={{ minWidth: 330, flexShrink: 0, marginRight: 16 }}>
                  <Card
                    loading={loading}
                    style={{ borderRadius: 16, border: `3px solid ${col.color}`, background: 'var(--kanban-column-bg)' }}
                    styles={{ header: { backgroundColor: col.color }, body: { padding: 8, maxHeight: 'calc(100vh - 340px)', overflow: 'auto' } }}
                    title={
                      <Flex justify="space-between" align="center">
                        <Flex vertical gap={0}>
                          <Text strong>{col.title}</Text>
                          {col.subtitle ? <Text type="secondary" style={{ fontSize: 12 }}>{col.subtitle}</Text> : null}
                        </Flex>
                        <Badge count={col.tickets.length} showZero style={{ backgroundColor: 'var(--kanban-badge-bg)', color: 'var(--kanban-badge-color)', boxShadow: 'none' }} />
                      </Flex>
                    }
                  >
                    <SortableContext items={col.tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {col.tickets.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets" />
                      ) : (
                        col.tickets.map((t) => {
                          const hint = col.key === 'unassigned' ? bestFit(t) : fitFor(t, col.key)
                          return (
                            <div key={`${col.key}-${t.id}`}>
                              <KanbanCard
                                ticket={t}
                                dragDisabled
                                onEdit={openTicket}
                                onDelete={() => {}}
                                trackerStat={stats.get(t.id)}
                              />
                              <Flex gap={8} wrap align="center" style={{ margin: '-2px 12px 10px' }}>
                                {statusTag(t)}
                                {hint}
                              </Flex>
                            </div>
                          )
                        })
                      )}
                    </SortableContext>
                  </Card>
                </div>
              ))}
            </div>
          </DndContext>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
