'use client'

import { CommentOutlined,DeleteOutlined, EditOutlined, FieldTimeOutlined, FlagOutlined, MoreOutlined, UserOutlined } from '@ant-design/icons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar, Button, Card, Dropdown, Flex, Modal, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'

import DateDisplay from '@/components/common/DateDisplay'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

import type { StatusColumn,TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'
import { darkenColor,getVisibilityColor } from './types'

const { Text } = Typography

interface KanbanCardProps {
  ticket: TicketRecord
  dragDisabled?: boolean
  canDeleteTicket?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByPriority?: (priorityId: number) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
  allStatusColumns?: StatusColumn[]
}

export default function KanbanCard({
  ticket,
  dragDisabled = false,
  canDeleteTicket = false,
  onEdit,
  onDelete,
  onFilterByStatus,
  onFilterByPriority,
  onFilterByTag,
  onFilterByCompany,
  allStatusColumns,
}: KanbanCardProps) {
  const statusCols = allStatusColumns?.length ? allStatusColumns : DEFAULT_ALL_STATUS_COLUMNS
  const statusCol = statusCols.find((c) => c.id === ticket.status)
  const statusTitle = statusCol?.title ?? ticket.status
  const statusColor = statusCol?.color ?? '#8c8c8c'
  const router = useRouter()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id, disabled: dragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      className="kanban-sortable-ticket"
      style={{
        ...style,
        cursor: dragDisabled ? 'default' : 'grab',
      }}
      {...(!dragDisabled ? attributes : {})}
      {...(!dragDisabled ? listeners : {})}
    >
      <Card
        className="kanban-ticket-card"
        size="small"
        style={{
          margin: 6,
          borderRadius: 12,
          boxShadow: 'var(--kanban-card-shadow)',
          maxWidth: 300,
          width: '100%',
          backgroundColor: 'var(--kanban-card-bg)',
          border: '1px solid var(--kanban-card-border)',
        }}
        styles={{ body: { padding: 14, background: 'transparent' } }}
      >
        {/* Tags + menu row — stop drag sensor when interacting with filter chips */}
        <Flex justify="space-between" align="flex-start" style={{ marginBottom: 10 }}>
          <Flex
            gap={6}
            wrap="wrap"
            style={{ flex: 1, minWidth: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {ticket.priority && (
              <Tag
                color={ticket.priority.color ? undefined : 'default'}
                style={{
                  fontSize: 11,
                  margin: 0,
                  borderRadius: 9999,
                  cursor: onFilterByPriority ? 'pointer' : undefined,
                  ...(ticket.priority.color
                    ? {
                        backgroundColor: ticket.priority.color,
                        borderColor: darkenColor(ticket.priority.color),
                        color: '#fff',
                      }
                    : {}),
                }}
                title={onFilterByPriority ? 'Filter by this priority' : undefined}
                onClick={
                  onFilterByPriority
                    ? (e) => {
                        e.stopPropagation()
                        onFilterByPriority(ticket.priority!.id)
                      }
                    : undefined
                }
              >
                {ticket.priority.title}
              </Tag>
            )}
            {ticket.visibility !== 'team' && (
              <Tag color={getVisibilityColor(ticket.visibility as string)} style={{ border:'1px solid', fontSize: 11, margin: 0, borderRadius: 9999 }}>
                {ticket.visibility === 'specific_users' || ticket.visibility === 'private' ? 'Private' : ticket.visibility === 'public' ? 'Public' : (ticket.visibility as string).toUpperCase()}
              </Tag>
            )}
            {ticket.team_name && <Tag color="blue" style={{ border:'1px solid', fontSize: 11, margin: 0, borderRadius: 9999 }}>Team {ticket.team_name}</Tag>}
            {ticket.type && (
              <Tag color={ticket.type.color} style={{ border:'1px solid', margin: 0, fontSize: 11, borderRadius: 9999 }}>
                {ticket.type.title}
              </Tag>
            )}
            {ticket.company && (
              <Tag
                color={ticket.company.color ? undefined : 'default'}
                style={{
                  margin: 0,
                  fontSize: 11,
                  borderRadius: 9999,
                  cursor: onFilterByCompany ? 'pointer' : undefined,
                  ...(ticket.company.color
                    ? { backgroundColor: ticket.company.color, borderColor: darkenColor(ticket.company.color), color: '#fff' }
                    : {}),
                }}
                title={onFilterByCompany ? 'Filter by this company' : undefined}
                onClick={
                  onFilterByCompany
                    ? (e) => {
                        e.stopPropagation()
                        onFilterByCompany(ticket.company!.id)
                      }
                    : undefined
                }
              >
                {ticket.company.name}
              </Tag>
            )}
            {ticket.tags && ticket.tags.length > 0 && (
              ticket.tags.map((t) => (
                <Tag
                  key={t.id}
                  color={t.color ? undefined : 'default'}
                  style={{
                    margin: 0,
                    fontSize: 11,
                    borderRadius: 9999,
                    cursor: onFilterByTag ? 'pointer' : undefined,
                    ...(t.color ? { backgroundColor: t.color, borderColor: darkenColor(t.color), color: '#fff' } : {}),
                  }}
                  title={onFilterByTag ? 'Filter by this tag' : undefined}
                  onClick={
                    onFilterByTag
                      ? (e) => {
                          e.stopPropagation()
                          onFilterByTag(t.id)
                        }
                      : undefined
                  }
                >
                  {t.name}
                </Tag>
              ))
            )}
            {onFilterByStatus && (
              <Tag
                style={{
                  margin: 0,
                  fontSize: 11,
                  borderRadius: 9999,
                  backgroundColor: statusColor,
                  borderColor: darkenColor(statusColor),
                  color: '#fff',
                  cursor: 'pointer',
                }}
                title="Filter by this status"
                onClick={(e) => {
                  e.stopPropagation()
                  onFilterByStatus(ticket.status)
                }}
              >
                {statusTitle}
              </Tag>
            )}
            {Number(ticket.checklist_total) > 0 && (
              <Tag color="green" style={{ fontSize: 11, margin: 0, borderRadius: 9999 }}>
                Checklist: {ticket.checklist_completed}/{ticket.checklist_total}
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
                  onClick: () => onEdit(ticket),
                },
                ...(canDeleteTicket
                  ? [
                      {
                        key: 'delete',
                        label: 'Move to trash',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => {
                          Modal.confirm({
                            title: 'Move ticket to trash?',
                            content: 'The ticket will be hidden from the main list. You can open Trash from the sidebar to review.',
                            okText: 'Move to trash',
                            okButtonProps: { danger: true },
                            cancelText: 'Cancel',
                            onOk: () => onDelete(ticket.id),
                          })
                        },
                      },
                    ]
                  : []),
              ],
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined style={{ fontSize: 16, color: 'var(--kanban-card-muted)' }} />}
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        </Flex>

        {/* Title + subtitle - use <a> for native right-click "Open in new tab" */}
        <a
          href={`/tickets/${ticket.id}`}
          style={{ cursor: 'pointer', display: 'block', color: 'inherit', textDecoration: 'none' }}
          onClick={(e) => {
            e.stopPropagation()
            if (e.button !== 0) return
            if (e.ctrlKey || e.metaKey) return
            e.preventDefault()
            router.push(`/tickets/${ticket.id}`)
          }}
        >
          <Text strong style={{ fontSize: 14, color: 'var(--kanban-card-title)', lineHeight: 1.4, display: 'block' }}>
            {ticket.has_unread_replies && (
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
            )}
            #{ticket.id} {ticket.title}
          </Text>
          {ticket.by_label && (
            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic', color: '#1890ff', display: 'block', marginTop: 4 }}>
              by {ticket.by_label}
            </Text>
          )}
        </a>

        {/* Bottom: due, updated, comment, avatars */}
        <Flex
          justify="space-between"
          align="center"
          style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--kanban-card-divider)' }}
          wrap="wrap"
          gap={8}
        >
          <Flex gap={10} align="center" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            {ticket.due_date && (
              <Flex
                align="center"
                gap={4}
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color:
                    dayjs(ticket.due_date).isBefore(dayjs()) && !isClosedLikeTicketStatus(ticket.status)
                      ? '#ff4d4f'
                      : 'var(--kanban-card-muted)',
                }}
              >
                <FlagOutlined />
                <span>Due <DateDisplay date={ticket.due_date} format="date-only" /></span>
              </Flex>
            )}
            {ticket.updated_at && (
              <Flex align="center" gap={4} style={{ color: 'var(--kanban-card-muted)', fontSize: 11 }}>
                <FieldTimeOutlined />
                <span>Updated <DateDisplay date={ticket.updated_at} format="date-only" /></span>
              </Flex>
            )}
            {ticket.has_unread_replies && (
              <Tooltip title="Unread replies">
                <CommentOutlined style={{ color: 'var(--kanban-card-muted)', fontSize: 12 }} />
              </Tooltip>
            )}
          </Flex>
          {ticket.assignees && ticket.assignees.length > 0 && (
            <Avatar.Group size="small" maxCount={3}>
              {ticket.assignees.map((assignee) => (
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
