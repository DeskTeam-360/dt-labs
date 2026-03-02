'use client'

import { Card, Button, Dropdown, Flex, Tag, Tooltip, Avatar, Modal, Typography } from 'antd'
import { EditOutlined, DeleteOutlined, UserOutlined, MoreOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import dayjs from 'dayjs'
import type { TodoRecord } from './types'
import { getVisibilityColor, darkenColor } from './types'
import DateDisplay from '../DateDisplay'

const { Text } = Typography

interface KanbanCardProps {
  todo: TodoRecord
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: number) => void
}

export default function KanbanCard({ todo, onEdit, onDelete }: KanbanCardProps) {
  const router = useRouter()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        size="small"
        style={{
          marginBottom: 12,
          cursor: 'grab',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          maxWidth: '300px',
          width: '100%',
        }}
        {...listeners}
      >
        <Flex justify="space-between" align="center">
          <Text
            strong
            style={{ fontSize: 14, flex: 1, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/tickets/${todo.id}`)
            }}
          >
            {todo.title}
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>
              Created by {todo.creator_name}
            </div>
          </Text>
          <Dropdown 
            menu={{
              items: [
                {
                  key: 'edit',
                  label: 'Edit',
                  icon: <EditOutlined />,
                  onClick: () => onEdit(todo),
                },
                {
                  key: 'delete',
                  label: 'Delete',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: 'Delete Ticket',
                      content: 'Are you sure?',
                      okText: 'Yes',
                      cancelText: 'No',
                      onOk: () => onDelete(todo.id),
                    })
                  },
                },
              ],
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="large"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        </Flex>

        <Flex gap={5} wrap="wrap" style={{ maxWidth: '100%', marginTop: 8 }}>
          {todo.visibility !== 'team' && (
            <Tag color={getVisibilityColor(todo.visibility as string)} style={{ fontSize: 11, border: '1px solid' }}>
              {todo.visibility === 'specific_users' ? 'Specific Users' : todo.visibility.toUpperCase()}
            </Tag>
          )}
          {todo.team_name && <Tag color="blue" style={{ fontSize: 11, border: '1px solid' }}>Team {todo.team_name}</Tag>}
          {todo.type && (
            <Tag color={todo.type.color} style={{ border: '1px solid', fontSize: 11 }}>
              {todo.type.title}
            </Tag>
          )}
          {todo.company && (
            <Tag
              color={todo.company.color ? undefined : 'cyan'}
              style={{ border: '1px solid', fontSize: 11, ...(todo.company.color ? { backgroundColor: todo.company.color, borderColor: darkenColor(todo.company.color), color: '#fff' } : {}) }}
            >
              {todo.company.name}
            </Tag>
          )}
          {todo.tags && todo.tags.length > 0 && (
            <Flex gap={4} wrap="wrap">
              {todo.tags.map((t) => (
                <Tag
                  key={t.id}
                  color={t.color ? undefined : 'default'}
                  style={{ border: '1px solid', fontSize: 11, ...(t.color ? { backgroundColor: t.color, borderColor: darkenColor(t.color), color: '#fff' } : {}) }}
                >
                  {t.name}
                </Tag>
              ))}
            </Flex>
          )}
          <div style={{ width: '100%' }}>
          {Number(todo.checklist_total) > 0 ? (
          <Tag color="green" style={{ fontSize: 11, border: '1px solid' }}>
            Checklist: {todo.checklist_completed}/{todo.checklist_total}
          </Tag>
        ) : null}
          </div>
        </Flex>

     

        {todo.assignees && todo.assignees.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Avatar.Group size="small" maxCount={3}>
              {todo.assignees.map((assignee) => (
                <Tooltip key={assignee.id} title={assignee.user_name}>
                  <Avatar size="small" icon={<UserOutlined />} />
                </Tooltip>
              ))}
            </Avatar.Group>
          </div>
        )}

        {todo.due_date && (
          <div style={{ marginTop: 8 }}>
            <Tag
              color={dayjs(todo.due_date).isBefore(dayjs()) && todo.status !== 'completed' && todo.status !== 'cancel' ? 'error' : 'default'}
              style={{ fontSize: 11, border: '1px solid' }}
            >
              Due Date: <DateDisplay date={todo.due_date} />
            </Tag>
          </div>
        )}

       
      </Card>
    </div>
  )
}
