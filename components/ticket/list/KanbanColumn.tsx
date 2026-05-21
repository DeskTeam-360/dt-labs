'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge, Card, Empty, Typography } from 'antd'
import { useMemo } from 'react'

import KanbanCard from './KanbanCard'
import {
  sortTickets,
  type StatusColumn,
  type TicketRecord,
  TICKETS_LIST_SORT_BY,
  TICKETS_LIST_SORT_ORDER,
  type TicketSortField,
  type TicketSortOrder,
} from './types'

const { Text } = Typography

interface KanbanColumnProps {
  column: StatusColumn
  tickets: TicketRecord[]
  dragDisabled?: boolean
  canDeleteTicket?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  allStatusColumns?: StatusColumn[]
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

export default function KanbanColumn({
  column,
  tickets,
  dragDisabled = false,
  canDeleteTicket = false,
  onEdit,
  onDelete,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
  allStatusColumns,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
}: KanbanColumnProps) {
  const columnTickets = useMemo(() => {
    const filtered = tickets.filter((t) => t.status === column.id)
    return sortTickets(filtered, sortBy, sortOrder)
  }, [tickets, column.id, sortBy, sortOrder])

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <div style={{ minWidth: 320, flexShrink: 0, marginRight: 16, marginBottom: 16 }}>
      <Card
        className="kanban-column-card"
        style={{
          height: 'calc(100vh - 140px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--kanban-column-bg)',
          borderRadius: 16,
          border: `3px solid ${column.color}`,
        }}
        styles={{
          header: { backgroundColor: column.color },
          body: {
            flex: 1,
            overflow: 'auto',
            padding: 0,
            position: 'relative',
            background: 'transparent',
          },
        }}
        title={
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingRight: 8,
              paddingLeft: 8,
            }}
          >
            <Text strong style={{ color: 'var(--kanban-column-head-title)' }}>
              {column.title}
            </Text>
            <Badge
              count={columnTickets.length}
              showZero
              style={{
                backgroundColor: 'var(--kanban-badge-bg)',
                color: 'var(--kanban-badge-color)',
                boxShadow: 'none',
              }}
            />
          </div>
        }
      >
        <div
          ref={setNodeRef}
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: '100%',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <SortableContext items={columnTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {columnTickets.length === 0 ? (
              <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description={`No ${column.title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              columnTickets.map((ticket) => (
                <KanbanCard
                  key={ticket.id}
                  ticket={ticket}
                  dragDisabled={dragDisabled}
                  canDeleteTicket={canDeleteTicket}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  allStatusColumns={allStatusColumns}
                  onFilterByStatus={onFilterByStatus}
                  onFilterByTag={onFilterByTag}
                  onFilterByCompany={onFilterByCompany}
                />
              ))
            )}
          </SortableContext>
        </div>
      </Card>
    </div>
  )
}
