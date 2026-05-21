'use client'

import { Col, Empty, Row } from 'antd'
import { useMemo } from 'react'

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
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

export default function TicketsCardView({
  tickets,
  allStatusColumns,
  onEdit,
  onDelete,
  canDeleteTicket = false,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
}: TicketsCardViewProps) {
  const sortedTickets = useMemo(
    () => sortTickets(tickets, sortBy, sortOrder),
    [tickets, sortBy, sortOrder]
  )

  if (sortedTickets.length === 0) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center' }}>
        <Empty description="No tickets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <Row gutter={24} style={{ width: '100%', paddingRight: 24, paddingLeft: 24 }}>
      {sortedTickets.map((ticket) => (
        <Col span={24} md={24} lg={24} xl={24} style={{ marginBottom:12 }} key={ticket.id}>
          <CardViewCard
            ticket={ticket}
            allStatusColumns={allStatusColumns}
            onEdit={onEdit}
            onDelete={onDelete}
            canDeleteTicket={canDeleteTicket}
            onFilterByStatus={onFilterByStatus}
            onFilterByTag={onFilterByTag}
            onFilterByCompany={onFilterByCompany}
          />
        </Col>
      ))}
    </Row>
  )
}
