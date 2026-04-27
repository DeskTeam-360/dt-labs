'use client'

import { Col, Empty,Row } from 'antd'
import { useMemo } from 'react'

import CardViewCard from './CardViewCard'
import type { StatusColumn, TicketRecord, TicketSortField, TicketSortOrder } from './types'
import { sortTickets } from './types'

interface TicketsCardViewProps {
  tickets: TicketRecord[]
  allStatusColumns?: StatusColumn[]
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  canDeleteTicket?: boolean
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  allPriorities?: Array<{ id: number }>
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByPriority?: (priorityId: number) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

export default function TicketsCardView({
  tickets,
  allStatusColumns,
  onEdit,
  onDelete,
  canDeleteTicket = false,
  sortBy = 'updated_at',
  sortOrder = 'desc',
  allPriorities = [],
  onFilterByStatus,
  onFilterByPriority,
  onFilterByTag,
  onFilterByCompany,
}: TicketsCardViewProps) {
  const sortedTickets = useMemo(
    () => sortTickets(tickets, sortBy, sortOrder, allPriorities),
    [tickets, sortBy, sortOrder, allPriorities]
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
            onFilterByPriority={onFilterByPriority}
            onFilterByTag={onFilterByTag}
            onFilterByCompany={onFilterByCompany}
          />
        </Col>
      ))}
    </Row>
  )
}
