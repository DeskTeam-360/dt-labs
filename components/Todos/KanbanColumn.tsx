'use client'

import { Card, Empty, Badge, Typography } from 'antd'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import KanbanCard from './KanbanCard'
import type { TodoRecord, StatusColumn } from './types'

const { Text } = Typography

interface KanbanColumnProps {
  column: StatusColumn
  todos: TodoRecord[]
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: number) => void
}

export default function KanbanColumn({
  column,
  todos,
  onEdit,
  onDelete,
}: KanbanColumnProps) {
  const columnTodos = todos.filter((todo) => todo.status === column.id)

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
            <Badge count={columnTodos.length} style={{ backgroundColor: column.color }} />
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
          <SortableContext items={columnTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {columnTodos.length === 0 ? (
              <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description={`No ${column.title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              columnTodos.map((todo) => (
                <KanbanCard key={todo.id} todo={todo} onEdit={onEdit} onDelete={onDelete} />
              ))
            )}
          </SortableContext>
        </div>
      </Card>
    </div>
  )
}
