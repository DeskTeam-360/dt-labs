'use client'

import { SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons'
import { Button, Col, Empty, Flex, Pagination, Row, Select, Spin, Tooltip, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'

import CardViewCard from './CardViewCard'
import {
  sortTickets,
  type StatusColumn,
  TICKET_SORT_FIELDS,
  type TicketRecord,
  TICKETS_LIST_SORT_BY,
  TICKETS_LIST_SORT_ORDER,
  type TicketSortField,
  type TicketSortOrder,
} from './types'

interface TicketsCardViewProps {
  tickets: TicketRecord[]
  allStatusColumns?: StatusColumn[]
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  canDeleteTicket?: boolean
  isCustomer?: boolean
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
  /** Server-side paging: `tickets` is already the current page. */
  serverPaging?: { page: number; pageSize: number; total: number; onChange: (page: number, pageSize: number) => void }
  serverSort?: { sortBy: TicketSortField; sortOrder: TicketSortOrder; onChange: (sortBy: TicketSortField, sortOrder: TicketSortOrder) => void }
  loading?: boolean
}

const DEFAULT_PAGE_SIZE = 15
const SESSION_KEY = 'tickets_card_page'

function readSessionPage(): { page: number; pageSize: number } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE }
}

export default function TicketsCardView({
  tickets,
  allStatusColumns,
  onEdit,
  onDelete,
  canDeleteTicket = false,
  isCustomer = false,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
  serverPaging,
  serverSort,
  loading = false,
}: TicketsCardViewProps) {
  const saved = readSessionPage()
  const [page, setPage] = useState(saved.page)
  const [pageSize, setPageSize] = useState(saved.pageSize)
  const [ticketStatsMap, setTicketStatsMap] = useState<Map<number, TicketTrackerStat>>(new Map())
  const lastIdsRef = useRef<string>('')

  useEffect(() => {
    const ids = tickets.map((t) => t.id)
    if (ids.length === 0) return
    const key = ids.join(',')
    if (key === lastIdsRef.current) return
    lastIdsRef.current = key
    fetch(`/api/tickets/ticket-time-stats?ticket_ids=${key}`)
      .then((r) => r.json())
      .then((data: TicketTrackerStat[]) => {
        const map = new Map<number, TicketTrackerStat>()
        for (const s of data) map.set(s.ticket_id, s)
        setTicketStatsMap(map)
      })
      .catch(() => { /* ignore */ })
  }, [tickets])

  const sortedTickets = useMemo(
    () => (serverPaging ? tickets : sortTickets(tickets, sortBy, sortOrder)),
    [tickets, sortBy, sortOrder, serverPaging]
  )

  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / pageSize))
  const effectivePage = page > totalPages ? totalPages : page

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ page: effectivePage, pageSize })) } catch { /* ignore */ }
  }, [effectivePage, pageSize])

  const paged = useMemo(
    () => (serverPaging ? sortedTickets : sortedTickets.slice((effectivePage - 1) * pageSize, effectivePage * pageSize)),
    [sortedTickets, effectivePage, pageSize, serverPaging]
  )

  const sortBar = serverSort ? (
    <Flex align="center" gap={8} style={{ padding: '0 24px 12px' }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>Sort by</Typography.Text>
      <Select
        size="small"
        style={{ width: 150 }}
        value={serverSort.sortBy}
        options={TICKET_SORT_FIELDS}
        onChange={(v) => serverSort.onChange(v, serverSort.sortOrder)}
      />
      <Tooltip title={serverSort.sortOrder === 'asc' ? 'Ascending' : 'Descending'}>
        <Button
          size="small"
          icon={serverSort.sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
          onClick={() => serverSort.onChange(serverSort.sortBy, serverSort.sortOrder === 'asc' ? 'desc' : 'asc')}
        />
      </Tooltip>
      {loading && <Spin size="small" />}
    </Flex>
  ) : null

  if (sortedTickets.length === 0) {
    return (
      <div style={{ width: '100%' }}>
        {sortBar}
        <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center' }}>
          {loading ? <Spin /> : <Empty description="No tickets" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', opacity: loading && serverPaging ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      {sortBar}
      <Row gutter={24} style={{ paddingRight: 24, paddingLeft: 24 }}>
        {paged.map((ticket) => (
          <Col span={24} style={{ marginBottom: 12 }} key={ticket.id}>
            <CardViewCard
              ticket={ticket}
              allStatusColumns={allStatusColumns}
              onEdit={onEdit}
              onDelete={onDelete}
              canDeleteTicket={canDeleteTicket}
              isCustomer={isCustomer}
              onFilterByStatus={onFilterByStatus}
              onFilterByTag={onFilterByTag}
              onFilterByCompany={onFilterByCompany}
              trackerStat={ticketStatsMap.get(ticket.id)}
            />
          </Col>
        ))}
      </Row>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 24px' }}>
        <Pagination
          current={serverPaging ? serverPaging.page : effectivePage}
          pageSize={serverPaging ? serverPaging.pageSize : pageSize}
          total={serverPaging ? serverPaging.total : sortedTickets.length}
          showSizeChanger
          pageSizeOptions={['10', '15', '20', '50']}
          showTotal={(t) => `Total ${t} tickets`}
          onChange={(p, ps) => {
            if (serverPaging) {
              serverPaging.onChange(ps !== serverPaging.pageSize ? 1 : p, ps)
              return
            }
            setPage(p)
            if (ps !== pageSize) { setPageSize(ps); setPage(1) }
          }}
          size="default"
        />
      </div>
    </div>
  )
}
