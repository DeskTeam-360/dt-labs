'use client'

import { Row, Col, Empty } from 'antd'
import CardViewCard from './CardViewCard'
import type { TodoRecord } from './types'

interface TodosCardViewProps {
  todos: TodoRecord[]
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: number) => void
}

export default function TodosCardView({ todos, onEdit, onDelete }: TodosCardViewProps) {
  if (todos.length === 0) {
    return (
      <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center' }}>
        <Empty description="No tickets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  return (
    <Row gutter={24} style={{ width: '100%', paddingRight: 24, paddingLeft: 24 }}>
      {todos.map((todo) => (
        <Col span={24} md={12} lg={8} xl={6} style={{ margin: 0 }} key={todo.id}>
          <CardViewCard todo={todo} onEdit={onEdit} onDelete={onDelete} />
        </Col>
      ))}
    </Row>
  )
}
