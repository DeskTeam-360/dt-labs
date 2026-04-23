'use client'

import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Card, Typography } from 'antd'

import KanbanColumn from './KanbanColumn'
import type { StatusColumn, TicketRecord, TicketSortField, TicketSortOrder } from './types'

const { Text } = Typography

/** Prefer droppable/cards under the pointer; avoids wrong column with horizontal scroll + dense cards. */
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args)
  if (byPointer.length > 0) return byPointer
  return closestCorners(args)
}

interface TicketsKanbanViewProps {
  tickets: TicketRecord[]
  columnsToShow: StatusColumn[]
  activeId: number | null
  isCustomer?: boolean
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void | Promise<void>
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  canDeleteTicket?: boolean
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  allPriorities?: Array<{ id: number }>
  allStatusColumns?: StatusColumn[]
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByPriority?: (priorityId: number) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

export default function TicketsKanbanView({
  tickets,
  columnsToShow,
  activeId,
  isCustomer = false,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  canDeleteTicket = false,
  sortBy = 'updated_at',
  sortOrder = 'desc',
  allPriorities = [],
  allStatusColumns,
  onFilterByStatus,
  onFilterByPriority,
  onFilterByTag,
  onFilterByCompany,
}: TicketsKanbanViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      /** Slightly more than a click; still responsive for drag. */
      activationConstraint: {
        distance: 6,
      },
    })
  )

  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) : null

  const board = (
    <div
      className="tickets-kanban-board"
      style={{
        paddingLeft: 24,
        paddingRight: 24,
        paddingBottom: 16,
        display: 'flex',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        overflowY: 'hidden',
        background: 'var(--kanban-board-bg)',
      }}
    >
      {columnsToShow.map((column) => (
        <KanbanColumn
          key={column.id}
          column={column}
          tickets={tickets}
          dragDisabled={isCustomer}
          canDeleteTicket={canDeleteTicket}
          onEdit={onEdit}
          onDelete={onDelete}
          sortBy={sortBy}
          sortOrder={sortOrder}
          allPriorities={allPriorities}
          allStatusColumns={allStatusColumns}
          onFilterByStatus={onFilterByStatus}
          onFilterByPriority={onFilterByPriority}
          onFilterByTag={onFilterByTag}
          onFilterByCompany={onFilterByCompany}
        />
      ))}
    </div>
  )

  if (isCustomer) {
    return board
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {board}
      <DragOverlay>
        {activeTicket ? (
          <Card
            className="kanban-ticket-card"
            size="small"
            style={{
              width: 280,
              boxShadow: 'var(--kanban-card-shadow)',
              backgroundColor: 'var(--kanban-drag-overlay-bg)',
              border: '1px solid var(--kanban-card-border)',
            }}
            bodyStyle={{ padding: 12, background: 'transparent' }}
          >
            <Text strong style={{ color: 'var(--kanban-card-title)' }}>
              #{activeTicket.id} {activeTicket.title}
            </Text>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
