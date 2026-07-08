'use client'

import { CommentOutlined, DeleteOutlined, EditOutlined, FieldTimeOutlined, FlagOutlined, MoreOutlined, RobotOutlined, SyncOutlined, UserOutlined } from '@ant-design/icons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar, Button, Card, Dropdown, Flex, Modal, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'

import DateDisplay from '@/components/common/DateDisplay'
import { KANBAN_SEMANTIC_BLUE, KANBAN_SEMANTIC_GREEN, kanbanTagStyle } from '@/lib/kanban-tag-chip-style'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

import type { StatusColumn, TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'

const { Text } = Typography

interface KanbanCardProps {
  ticket: TicketRecord
  dragDisabled?: boolean
  canDeleteTicket?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  onFilterByStatus?: (statusSlug: string) => void
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
            {ticket.priority != null && ticket.priority > 0 && (
              <Tag
                style={kanbanTagStyle({
                  neutral: true,
                })}
              >
                P{ticket.priority}
              </Tag>
            )}
            {ticket.visibility !== 'team' && (
              <Tag
                style={kanbanTagStyle({
                  ...(ticket.visibility === 'public' ? { fillHex: KANBAN_SEMANTIC_GREEN } : { neutral: true }),
                })}
              >
                {ticket.visibility === 'specific_users' || ticket.visibility === 'private'
                  ? 'Private'
                  : ticket.visibility === 'public'
                    ? 'Public'
                    : (ticket.visibility as string).toUpperCase()}
              </Tag>
            )}
            {ticket.team_name && (
              <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_BLUE })}>Team {ticket.team_name}</Tag>
            )}
            {ticket.type && (
              <Tag
                style={kanbanTagStyle({
                  ...(ticket.type.color ? { fillHex: ticket.type.color } : { neutral: true }),
                })}
              >
                {ticket.type.title}
              </Tag>
            )}
            {ticket.company && (
              <Tag
                style={kanbanTagStyle({
                  ...(ticket.company.color ? { fillHex: ticket.company.color } : { neutral: true }),
                  cursor: onFilterByCompany ? 'pointer' : undefined,
                })}
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
            {ticket.tags &&
              ticket.tags.length > 0 &&
              ticket.tags.map((t) => (
                <Tag
                  key={t.id}
                  style={kanbanTagStyle({
                    ...(t.color ? { fillHex: t.color } : { neutral: true }),
                    cursor: onFilterByTag ? 'pointer' : undefined,
                  })}
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
              ))}
            {onFilterByStatus && (
              <Tag
                style={kanbanTagStyle({
                  fillHex: statusColor,
                  cursor: 'pointer',
                })}
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
              <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_GREEN })}>
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
            {ticket.created_via === 'recurring' && (
              <SyncOutlined title="Created by recurring ticket" style={{ fontSize: 11, color: '#722ed1', marginLeft: 5, verticalAlign: 'middle' }} />
            )}
            {ticket.created_via === 'automation' && (
              <RobotOutlined title="Created by automation" style={{ fontSize: 11, color: '#722ed1', marginLeft: 5, verticalAlign: 'middle' }} />
            )}
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
