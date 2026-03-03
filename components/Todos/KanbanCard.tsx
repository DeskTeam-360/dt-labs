'use client'

import { Card, Button, Dropdown, Flex, Tag, Tooltip, Avatar, Modal, Typography } from 'antd'
import { EditOutlined, DeleteOutlined, UserOutlined, MoreOutlined, FlagOutlined, FieldTimeOutlined, CommentOutlined } from '@ant-design/icons'
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
          margin: 6,
          cursor: 'grab',
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          maxWidth: 300,
          width: '100%',
          backgroundColor: '#fafafa',
          border: '1px solid rgba(0,0,0,0.04)',
        }}
        styles={{ body: { padding: 14 } }}
        {...listeners}
      >
        {/* Tags + menu row */}
        <Flex justify="space-between" align="flex-start" style={{ marginBottom: 10 }}>
          <Flex gap={6} wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            {todo.priority && (
              <Tag color={todo.priority.color ? undefined : 'default'} style={{ fontSize: 11, margin: 0, borderRadius: 9999, ...(todo.priority.color ? { backgroundColor: todo.priority.color, borderColor: darkenColor(todo.priority.color), color: '#fff' } : {}) }}>
                {todo.priority.title}
              </Tag>
            )}
            {todo.visibility !== 'team' && (
              <Tag color={getVisibilityColor(todo.visibility as string)} style={{ border:'1px solid', fontSize: 11, margin: 0, borderRadius: 9999 }}>
                {todo.visibility === 'specific_users' ? 'Specific Users' : todo.visibility === 'public' ? 'Public' : todo.visibility.toUpperCase()}
              </Tag>
            )}
            {todo.team_name && <Tag color="blue" style={{ border:'1px solid', fontSize: 11, margin: 0, borderRadius: 9999 }}>Team {todo.team_name}</Tag>}
            {todo.type && (
              <Tag color={todo.type.color} style={{ border:'1px solid', margin: 0, fontSize: 11, borderRadius: 9999 }}>
                {todo.type.title}
              </Tag>
            )}
            {todo.company && (
              <Tag
                color={todo.company.color ? undefined : 'default'}
                style={{ margin: 0, fontSize: 11, borderRadius: 9999, ...(todo.company.color ? { backgroundColor: todo.company.color, borderColor: darkenColor(todo.company.color), color: '#fff' } : {}) }}
              >
                {todo.company.name}
              </Tag>
            )}
            {todo.tags && todo.tags.length > 0 && (
              todo.tags.map((t) => (
                <Tag
                  key={t.id}
                  color={t.color ? undefined : 'default'}
                  style={{ margin: 0, fontSize: 11, borderRadius: 9999, ...(t.color ? { backgroundColor: t.color, borderColor: darkenColor(t.color), color: '#fff' } : {}) }}
                >
                  {t.name}
                </Tag>
              ))
            )}
            {Number(todo.checklist_total) > 0 && (
              <Tag color="green" style={{ fontSize: 11, margin: 0, borderRadius: 9999 }}>
                Checklist: {todo.checklist_completed}/{todo.checklist_total}
              </Tag>
            )}
          </Flex>
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
              size="small"
              icon={<MoreOutlined style={{ fontSize: 16, color: '#8c8c8c' }} />}
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        </Flex>

        {/* Title + subtitle */}
        <div
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            router.push(`/tickets/${todo.id}`)
          }}
        >
          <Text strong style={{ fontSize: 14, color: '#262626', lineHeight: 1.4, display: 'block' }}>
            {todo.has_unread_replies && (
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
            )}
            #{todo.id} {todo.title}
          </Text>
          {todo.creator_name && (
            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic', color: '#1890ff', display: 'block', marginTop: 4 }}>
              by {todo.creator_name}
            </Text>
          )}
        </div>

        {/* Bottom: due, updated, comment, avatars */}
        <Flex justify="space-between" align="center" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }} wrap="wrap" gap={8}>
          <Flex gap={10} align="center" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            {todo.due_date && (
              <Flex align="center" gap={4} style={{ fontSize: 11, color: dayjs(todo.due_date).isBefore(dayjs()) && todo.status !== 'completed' && todo.status !== 'cancel' ? '#ff4d4f' : '#8c8c8c' }}>
                <FlagOutlined />
                <span>Due <DateDisplay date={todo.due_date} format="date-only" /></span>
              </Flex>
            )}
            {todo.updated_at && (
              <Flex align="center" gap={4} style={{ color: '#8c8c8c', fontSize: 11 }}>
                <FieldTimeOutlined />
                <span>Updated <DateDisplay date={todo.updated_at} format="date-only" /></span>
              </Flex>
            )}
            {todo.has_unread_replies && (
              <Tooltip title="Unread replies">
                <CommentOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
              </Tooltip>
            )}
          </Flex>
          {todo.assignees && todo.assignees.length > 0 && (
            <Avatar.Group size="small" maxCount={3}>
              {todo.assignees.map((assignee) => (
                <Tooltip key={assignee.id} title={assignee.user_name}>
                  <Avatar size="small" icon={<UserOutlined />} />
                </Tooltip>
              ))}
            </Avatar.Group>
          )}
        </Flex>
      </Card>
    </div>
  )
}
