'use client'

import { Card, Typography } from 'antd'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import KanbanColumn from './KanbanColumn'
import type { TicketRecord, StatusColumn } from './types'

const { Text } = Typography

interface TicketsKanbanViewProps {
  tickets: TicketRecord[]
  columnsToShow: StatusColumn[]
  activeId: number | null
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void | Promise<void>
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
}

export default function TicketsKanbanView({
  tickets,
  columnsToShow,
  activeId,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
}: TicketsKanbanViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div
        style={{
          paddingLeft: 24,
          paddingRight: 24,
          display: 'flex',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {columnsToShow.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tickets={tickets}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTicket ? (
          <Card
            size="small"
            style={{
              width: 280,
              boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            }}
            bodyStyle={{ padding: 12 }}
          >
            <Text strong>#{activeTicket.id} {activeTicket.title}</Text>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
