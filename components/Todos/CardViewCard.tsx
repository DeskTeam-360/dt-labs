'use client'

import { Card, Button, Dropdown, Flex, Tag, Tooltip, Avatar } from 'antd'
import { EditOutlined, DeleteOutlined, UserOutlined, MoreOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { Modal, Typography } from 'antd'
import dayjs from 'dayjs'
import type { TodoRecord } from './types'
import { getVisibilityColor, darkenColor } from './types'
import DateDisplay from '../DateDisplay'

const { Text } = Typography

interface CardViewCardProps {
  todo: TodoRecord
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: number) => void
}

export default function CardViewCard({ todo, onEdit, onDelete }: CardViewCardProps) {
  const router = useRouter()
  return (
    <Card
      size="small"
      style={{
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Flex justify="space-between" align="center">
        <Text
          strong
          style={{ fontSize: 14, flex: 1, cursor: 'pointer' }}
          onClick={() => router.push(`/tickets/${todo.id}`)}
        >
          {todo.title}
        </Text>
        <Dropdown
          menu={{
            items: [
              { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit(todo) },
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
          <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      </Flex>
      <Flex gap={5} wrap="wrap" style={{ maxWidth: '100%', marginBottom: 8 }}>
        {todo.visibility !== 'team' && (
          <Tag color={getVisibilityColor(todo.visibility)} style={{ fontSize: 11 }}>
            {todo.visibility === 'specific_users' ? 'Specific Users' : todo.visibility.toUpperCase()}
          </Tag>
        )}
        {todo.team_name && <Tag color="blue" style={{ fontSize: 11 }}>Team {todo.team_name}</Tag>}
        {todo.type && <Tag color={todo.type.color} style={{ fontSize: 11 }}>{todo.type.title}</Tag>}
        {todo.company && (
          <Tag
            color={todo.company.color ? undefined : 'cyan'}
            style={{ fontSize: 11, ...(todo.company.color ? { backgroundColor: todo.company.color, borderColor: darkenColor(todo.company.color), color: '#fff' } : {}) }}
          >
            {todo.company.name}
          </Tag>
        )}
        {todo.tags?.slice(0, 3).map((t) => (
          <Tag key={t.id} color={t.color ? undefined : 'default'} style={{ fontSize: 11, ...(t.color ? { backgroundColor: t.color, borderColor: darkenColor(t.color), color: '#fff' } : {}) }}>
            {t.name}
          </Tag>
        ))}
        {todo.tags && todo.tags.length > 3 && <span style={{ fontSize: 11, color: '#8c8c8c' }}>+{todo.tags.length - 3}</span>}
      </Flex>
      {Number(todo.checklist_total) > 0 && (
        <Tag color="green" style={{ fontSize: 11, marginBottom: 8 }}>
          Checklist: {todo.checklist_completed}/{todo.checklist_total}
        </Tag>
      )}
      {todo.assignees && todo.assignees.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <Avatar.Group size="small" maxCount={3}>
            {todo.assignees.map((a) => (
              <Tooltip key={a.id} title={a.user_name}>
                <Avatar size="small" icon={<UserOutlined />} />
              </Tooltip>
            ))}
          </Avatar.Group>
        </div>
      )}
      {todo.due_date && (
        <div style={{ marginTop: 4 }}>
          <Tag color={dayjs(todo.due_date).isBefore(dayjs()) && todo.status !== 'completed' && todo.status !== 'cancel' ? 'error' : 'default'} style={{ fontSize: 11 }}>
            Due: <DateDisplay date={todo.due_date} />
          </Tag>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
        By {todo.creator_name}
      </div>
    </Card>
  )
}
