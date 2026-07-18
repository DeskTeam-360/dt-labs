'use client'

import { ClockCircleOutlined, DeleteOutlined, EditOutlined, FlagOutlined, MoreOutlined, RobotOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Modal, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'

import { KANBAN_SEMANTIC_BLUE, KANBAN_SEMANTIC_GREEN, kanbanTagStyle } from '@/lib/kanban-tag-chip-style'

import type { StatusColumn, TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'

const { Text } = Typography

interface CardViewCardProps {
  ticket: TicketRecord
  allStatusColumns?: StatusColumn[]
  canDeleteTicket?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  /** Click priority / status / tag chips to apply list filters */
  onFilterByStatus?: (statusSlug: string) => void
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
          {ticket.created_via === 'recurring' && (
            <SyncOutlined title="Created by recurring ticket" style={{ fontSize: 12, color: '#722ed1', marginLeft: 6, verticalAlign: 'middle' }} />
          )}
          {ticket.created_via === 'automation' && (
            <RobotOutlined title="Created by automation" style={{ fontSize: 12, color: '#722ed1', marginLeft: 6, verticalAlign: 'middle' }} />
          )}
        </Text>
        <Text style={{ fontSize: 13, color: '#16324A', display: 'block' }}>
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
      <Flex justify="flex-end" gap={6} align="center" wrap="wrap" style={{ flexShrink: 0 }}>
        {ticket.priority != null && ticket.priority > 0 && (
          <Tag style={kanbanTagStyle({ neutral: true })}>P{ticket.priority}</Tag>
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
                    e.preventDefault()
                    e.stopPropagation()
                    onFilterByCompany(ticket.company!.id)
                  }
                : undefined
            }
          >
            {ticket.company.name}
          </Tag>
        )}
        {ticket.tags?.map((t) => (
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
                    e.preventDefault()
                    e.stopPropagation()
                    onFilterByTag(t.id)
                  }
                : undefined
            }
          >
            {t.name}
          </Tag>
        ))}
        {onFilterByStatus ? (
          <Tag
            style={kanbanTagStyle({
              fillHex: statusColor,
              cursor: 'pointer',
            })}
            title="Filter by this status"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFilterByStatus(ticket.status)
            }}
          >
            {statusTitle}
          </Tag>
        ) : (
          <Tag style={kanbanTagStyle({ fillHex: statusColor })}>{statusTitle}</Tag>
        )}
        {Number(ticket.checklist_total) > 0 && (
          <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_GREEN })}>
            Checklist: {ticket.checklist_completed}/{ticket.checklist_total}
          </Tag>
        )}
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
