'use client'

import { Row, Col, Empty } from 'antd'
import CardViewCard from './CardViewCard'
import type { TicketRecord, StatusColumn } from './types'

interface TicketsCardViewProps {
  tickets: TicketRecord[]
  allStatusColumns?: StatusColumn[]
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
}

export default function TicketsCardView({ tickets, allStatusColumns, onEdit, onDelete }: TicketsCardViewProps) {
  if (tickets.length === 0) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center' }}>
        <Empty description="No tickets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <Row gutter={24} style={{ width: '100%', paddingRight: 24, paddingLeft: 24 }}>
      {tickets.map((ticket) => (
        <Col span={24} md={24} lg={24} xl={24} style={{ padding:12 }} key={ticket.id}>
          <CardViewCard ticket={ticket} allStatusColumns={allStatusColumns} onEdit={onEdit} onDelete={onDelete} />
        </Col>
      ))}
    </Row>
  )
}
