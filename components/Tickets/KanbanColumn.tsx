'use client'

import { useMemo } from 'react'
import { Card, Empty, Badge, Typography } from 'antd'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import KanbanCard from './KanbanCard'
import type { TicketRecord, StatusColumn, TicketSortField, TicketSortOrder } from './types'
import { sortTickets } from './types'

const { Text } = Typography

interface KanbanColumnProps {
  column: StatusColumn
  tickets: TicketRecord[]
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  allPriorities?: Array<{ id: number }>
  allStatusColumns?: StatusColumn[]
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByPriority?: (priorityId: number) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

export default function KanbanColumn({
  column,
  tickets,
  onEdit,
  onDelete,
  sortBy = 'updated_at',
  sortOrder = 'desc',
  allPriorities = [],
  allStatusColumns,
  onFilterByStatus,
  onFilterByPriority,
  onFilterByTag,
  onFilterByCompany,
}: KanbanColumnProps) {
  const columnTickets = useMemo(() => {
    const filtered = tickets.filter((t) => t.status === column.id)
    return sortTickets(filtered, sortBy, sortOrder, allPriorities)
  }, [tickets, column.id, sortBy, sortOrder, allPriorities])

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <div style={{ minWidth: 320, flexShrink: 0, marginRight: 16, marginBottom: 16 }}>
      <Card
        style={{
          height: 'calc(100vh - 140px)',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafafa',
          borderRadius: 16,
          border: `3px solid ${column.color}`,
        }}
        styles={{
          header: { backgroundColor: column.color },
          body: { flex: 1, overflow: 'auto', padding: 0, position: 'relative' },
        }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' , paddingRight: 8, paddingLeft: 8 }}>
            <Text strong>{column.title}</Text>
            <Badge count={columnTickets.length} color={'white'} style={{ backgroundColor: '#fff', color: '#000' }} />
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
                  onEdit={onEdit}
                  onDelete={onDelete}
                  allStatusColumns={allStatusColumns}
                  onFilterByStatus={onFilterByStatus}
                  onFilterByPriority={onFilterByPriority}
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
