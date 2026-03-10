'use client'

import { Card, Button, Dropdown, Flex, Tag, Tooltip, Avatar } from 'antd'
import { EditOutlined, DeleteOutlined, UserOutlined, MoreOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { Modal, Typography } from 'antd'
import dayjs from 'dayjs'
import type { TicketRecord } from './types'
import { getVisibilityColor, darkenColor } from './types'
import DateDisplay from '../DateDisplay'

const { Text } = Typography

interface CardViewCardProps {
  ticket: TicketRecord
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
}

export default function CardViewCard({ ticket, onEdit, onDelete }: CardViewCardProps) {
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
          onClick={() => router.push(`/tickets/${ticket.id}`)}
        >
          {ticket.has_unread_replies && (
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
          )}
          #{ticket.id} {ticket.title}
        </Text>
        <Dropdown
          menu={{
            items: [
              { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit(ticket) },
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
                    onOk: () => onDelete(ticket.id),
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
        {ticket.visibility !== 'team' && (
          <Tag color={getVisibilityColor(ticket.visibility)} style={{ fontSize: 11 }}>
            {ticket.visibility === 'specific_users' ? 'Specific Users' : ticket.visibility === 'public' ? 'Public' : ticket.visibility.toUpperCase()}
          </Tag>
        )}
        {ticket.team_name && <Tag color="blue" style={{ fontSize: 11 }}>Team {ticket.team_name}</Tag>}
        {ticket.type && <Tag color={ticket.type.color} style={{ fontSize: 11 }}>{ticket.type.title}</Tag>}
        {ticket.priority && (
          <Tag color={ticket.priority.color ? undefined : 'default'} style={{ fontSize: 11, ...(ticket.priority.color ? { backgroundColor: ticket.priority.color, borderColor: darkenColor(ticket.priority.color), color: '#fff' } : {}) }}>
            {ticket.priority.title}
          </Tag>
        )}
        {ticket.company && (
          <Tag
            color={ticket.company.color ? undefined : 'cyan'}
            style={{ fontSize: 11, ...(ticket.company.color ? { backgroundColor: ticket.company.color, borderColor: darkenColor(ticket.company.color), color: '#fff' } : {}) }}
          >
            {ticket.company.name}
          </Tag>
        )}
        {ticket.tags?.slice(0, 3).map((t) => (
          <Tag key={t.id} color={t.color ? undefined : 'default'} style={{ fontSize: 11, ...(t.color ? { backgroundColor: t.color, borderColor: darkenColor(t.color), color: '#fff' } : {}) }}>
            {t.name}
          </Tag>
        ))}
        {ticket.tags && ticket.tags.length > 3 && <span style={{ fontSize: 11, color: '#8c8c8c' }}>+{ticket.tags.length - 3}</span>}
      </Flex>
      {Number(ticket.checklist_total) > 0 && (
        <Tag color="green" style={{ fontSize: 11, marginBottom: 8 }}>
          Checklist: {ticket.checklist_completed}/{ticket.checklist_total}
        </Tag>
      )}
      {ticket.assignees && ticket.assignees.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <Avatar.Group size="small" maxCount={3}>
            {ticket.assignees.map((a) => (
              <Tooltip key={a.id} title={a.user_name}>
                <Avatar size="small" icon={<UserOutlined />} />
              </Tooltip>
            ))}
          </Avatar.Group>
        </div>
      )}
      {ticket.due_date && (
        <div style={{ marginTop: 4 }}>
          <Tag color={dayjs(ticket.due_date).isBefore(dayjs()) && ticket.status !== 'completed' && ticket.status !== 'cancel' ? 'error' : 'default'} style={{ fontSize: 11 }}>
            Due: <DateDisplay date={ticket.due_date} />
          </Tag>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
        By {ticket.by_label ?? ticket.creator_name}
      </div>
    </Card>
  )
}
