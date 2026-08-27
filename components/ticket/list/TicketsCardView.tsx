'use client'

import { Col, Empty, Pagination, Row } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import CardViewCard from './CardViewCard'
import {
  sortTickets,
  type StatusColumn,
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
}: TicketsCardViewProps) {
  const saved = readSessionPage()
  const [page, setPage] = useState(saved.page)
  const [pageSize, setPageSize] = useState(saved.pageSize)

  const sortedTickets = useMemo(
    () => sortTickets(tickets, sortBy, sortOrder),
    [tickets, sortBy, sortOrder]
  )

  // Clamp page if tickets shrink (filter applied) and persist to sessionStorage
  useEffect(() => {
    setPage((p) => {
      const totalPages = Math.max(1, Math.ceil(sortedTickets.length / pageSize))
      return p <= totalPages ? p : totalPages
    })
  }, [sortedTickets.length, pageSize])

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ page, pageSize })) } catch { /* ignore */ }
  }, [page, pageSize])

  const paged = useMemo(
    () => sortedTickets.slice((page - 1) * pageSize, page * pageSize),
    [sortedTickets, page, pageSize]
  )

  if (sortedTickets.length === 0) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center' }}>
        <Empty description="No tickets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
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
            />
          </Col>
        ))}
      </Row>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 24px' }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={sortedTickets.length}
          showSizeChanger
          pageSizeOptions={['10', '15', '20', '50']}
          showTotal={(t) => `Total ${t} tickets`}
          onChange={(p, ps) => {
            setPage(p)
            if (ps !== pageSize) { setPageSize(ps); setPage(1) }
          }}
          size="default"
        />
      </div>
    </div>
  )
}
