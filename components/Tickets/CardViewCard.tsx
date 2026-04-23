'use client'

import { ClockCircleOutlined,DeleteOutlined, EditOutlined, FlagOutlined, MoreOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Typography } from 'antd'
import { Modal } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'

import type { StatusColumn,TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'

const { Text } = Typography

const tagStyle = {
  padding: '8px 16px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
} as const

interface CardViewCardProps {
  ticket: TicketRecord
  allStatusColumns?: StatusColumn[]
  canDeleteTicket?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  /** Click priority / status / tag chips to apply list filters */
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByPriority?: (priorityId: number) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
}

export default function CardViewCard({
  ticket,
  allStatusColumns,
  canDeleteTicket = false,
  onEdit,
  onDelete,
  onFilterByStatus,
  onFilterByPriority,
  onFilterByTag,
  onFilterByCompany,
}: CardViewCardProps) {
  const router = useRouter()
  const statusCols = allStatusColumns?.length ? allStatusColumns : DEFAULT_ALL_STATUS_COLUMNS
  const statusCol = statusCols.find((c) => c.id === ticket.status)
  const statusTitle = statusCol?.title ?? ticket.status
  const statusColor = statusCol?.color ?? '#8c8c8c'

  const ticketUrl = `/tickets/${ticket.id}`
  return (
    <Flex
      justify="space-between"
      gap={12}
      align="stretch"
      style={{
        width: '100%',
        padding: 16,
        background: 'var(--kanban-card-bg)',
        borderRadius: 12,
        border: '1px solid var(--kanban-card-border)',
        boxShadow: 'var(--kanban-card-shadow)',
      }}
    >
      <a
        href={ticketUrl}
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          color: 'inherit',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          if (e.button !== 0) return
          if (e.ctrlKey || e.metaKey) return
          e.preventDefault()
          router.push(ticketUrl)
        }}
      >
      <Flex vertical justify="flex-start" align="flex-start" gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ fontSize: 16, fontWeight: 700, color: 'var(--kanban-card-title)', lineHeight: 1.4 }}>
          {ticket.has_unread_replies && (
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
          )}
          #{ticket.id} {ticket.title}
        </Text>
        <Text style={{ fontSize: 13, color: '#1890ff', display: 'block' }}>
          by {ticket.by_label ?? ticket.creator_name ?? 'Unassigned'}
        </Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 4 }}>
          {ticket.due_date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
              <FlagOutlined style={{ fontSize: 12 }} />
              Due {dayjs(ticket.due_date).format('MMM DD, YYYY')}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
            <ClockCircleOutlined style={{ fontSize: 12 }} />
            Updated {dayjs(ticket.updated_at).format('MMM DD, YYYY')}
          </span>
        </div>
        {Number(ticket.checklist_total) > 0 && (
          <span style={{ marginTop: 4, fontSize: 12, color: 'var(--kanban-card-muted)' }}>
            Checklist: {ticket.checklist_completed}/{ticket.checklist_total}
          </span>
        )}
      </Flex>
      </a>
      <Flex justify="flex-end" gap={8} align="center" wrap="wrap" style={{ flexShrink: 0 }}>
        {ticket.priority && (
          <span
            style={{
              ...tagStyle,
              background: ticket.priority.color ?? 'var(--ticket-row-chip-neutral-bg)',
              color: ticket.priority.color ? '#fff' : 'var(--ticket-row-chip-neutral-fg)',
              cursor: onFilterByPriority ? 'pointer' : undefined,
            }}
            title={onFilterByPriority ? 'Filter by this priority' : undefined}
            role={onFilterByPriority ? 'button' : undefined}
            onClick={
              onFilterByPriority
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onFilterByPriority(ticket.priority!.id)
                  }
                : undefined
            }
          >
            {ticket.priority.title}
          </span>
        )}
        {ticket.company && (
          <span
            style={{
              ...tagStyle,
              background: ticket.company.color ?? 'var(--ticket-row-chip-neutral-bg)',
              color: ticket.company.color ? '#fff' : 'var(--ticket-row-chip-neutral-fg)',
              cursor: onFilterByCompany ? 'pointer' : undefined,
            }}
            title={onFilterByCompany ? 'Filter by this company' : undefined}
            role={onFilterByCompany ? 'button' : undefined}
            onClick={
              onFilterByCompany
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onFilterByCompany(ticket.company!.id)
                  }
                : undefined
            }
          >
            {ticket.company.name}
          </span>
        )}
        {ticket.tags?.slice(0, 3).map((tag) => (
          <span
            key={tag.id}
            style={{
              ...tagStyle,
              background: tag.color ?? 'var(--ticket-row-chip-neutral-bg)',
              color: tag.color ? '#fff' : 'var(--ticket-row-chip-neutral-fg)',
              cursor: onFilterByTag ? 'pointer' : undefined,
            }}
            title={onFilterByTag ? 'Filter by this tag' : undefined}
            role={onFilterByTag ? 'button' : undefined}
            onClick={
              onFilterByTag
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onFilterByTag(tag.id)
                  }
                : undefined
            }
          >
            {tag.name}
          </span>
        ))}
        {ticket.tags && ticket.tags.length > 3 && (
          <span style={{ ...tagStyle, background: 'var(--ticket-row-chip-neutral-bg)', color: 'var(--ticket-row-chip-neutral-fg)' }}>+{ticket.tags.length - 3}</span>
        )}
        <span
          style={{
            ...tagStyle,
            background: statusColor,
            color: '#fff',
            cursor: onFilterByStatus ? 'pointer' : undefined,
          }}
          title={onFilterByStatus ? 'Filter by this status' : undefined}
          role={onFilterByStatus ? 'button' : undefined}
          onClick={
            onFilterByStatus
              ? (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onFilterByStatus(ticket.status)
                }
              : undefined
          }
        >
          {statusTitle}
        </span>
        <Dropdown
          menu={{
            items: [
              { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit(ticket) },
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
                          content: 'The ticket will be hidden from the main list. Open Trash from the sidebar to review.',
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
          <Button type="text" size="small" icon={<MoreOutlined />} style={{ marginLeft: 4 }} />
        </Dropdown>
      </Flex>
    </Flex>
  )
}
