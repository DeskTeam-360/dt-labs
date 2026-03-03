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
import type { TodoRecord, StatusColumn } from './types'

const { Text } = Typography

interface TodosKanbanViewProps {
  todos: TodoRecord[]
  columnsToShow: StatusColumn[]
  activeId: number | null
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void | Promise<void>
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: number) => void
}

export default function TodosKanbanView({
  todos,
  columnsToShow,
  activeId,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
}: TodosKanbanViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const activeTodo = activeId ? todos.find((t) => t.id === activeId) : null

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
            todos={todos}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTodo ? (
          <Card
            size="small"
            style={{
              width: 280,
              boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            }}
            bodyStyle={{ padding: 12 }}
          >
            <Text strong>#{activeTodo.id} {activeTodo.title}</Text>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
