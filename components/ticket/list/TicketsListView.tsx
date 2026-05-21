'use client'

import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  MoreOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Flex,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import { useRouter } from 'next/navigation'
import type { Key } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { KANBAN_SEMANTIC_BLUE, kanbanTagStyle } from '@/lib/kanban-tag-chip-style'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

import type { StatusColumn, TicketRecord, TicketSortField, TicketSortOrder } from './types'
import {
  sortTickets,
  TICKETS_LIST_SORT_BY,
  TICKETS_LIST_SORT_ORDER,
} from './types'

interface TicketsListViewProps {
  tickets: TicketRecord[]
  allStatusColumns: StatusColumn[]
  isCustomer?: boolean
  filterTicketType?: 'spam' | 'trash' | null
  canDeleteTicket?: boolean
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
  onBulkMoveToSpam?: (ids: number[]) => void | Promise<void>
  onBulkMoveToTrash?: (ids: number[]) => void | Promise<void>
  onFilterByStatus?: (statusSlug: string) => void
  onFilterByTag?: (tagId: string) => void
  onFilterByCompany?: (companyId: string) => void
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
}

export default function TicketsListView({
  tickets,
  allStatusColumns,
  isCustomer = false,
  filterTicketType = null,
  canDeleteTicket = false,
  onEdit,
  onDelete,
  onBulkMoveToSpam,
  onBulkMoveToTrash,
  onFilterByStatus,
  onFilterByTag,
  onFilterByCompany,
  sortBy = TICKETS_LIST_SORT_BY,
  sortOrder = TICKETS_LIST_SORT_ORDER,
}: TicketsListViewProps) {
  const router = useRouter()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])

  const sortedTickets = useMemo(
    () => sortTickets(tickets, sortBy, sortOrder),
    [tickets, sortBy, sortOrder]
  )

  useEffect(() => {
    setPagination((p) => {
      const totalPages = Math.max(1, Math.ceil(sortedTickets.length / p.pageSize))
      if (p.current <= totalPages) return p
      return { ...p, current: totalPages }
    })
  }, [sortedTickets.length, pagination.pageSize])

  const bulkEnabled = !isCustomer && (onBulkMoveToSpam || onBulkMoveToTrash)
  const inSpamFolder = filterTicketType === 'spam'
  const inTrashFolder = filterTicketType === 'trash'
  const selectedIds = selectedRowKeys.map((k) => Number(k)).filter((n) => !Number.isNaN(n))

  const runBulkSpam = () => {
    if (!onBulkMoveToSpam || selectedIds.length === 0) return
    Modal.confirm({
      title: 'Move to spam',
      content: `Mark ${selectedIds.length} ticket(s) as spam? Open Spam from the sidebar to review or move them to trash.`,
      okText: 'Move to spam',
      cancelText: 'Cancel',
      onOk: async () => {
        await onBulkMoveToSpam(selectedIds)
        setSelectedRowKeys([])
      },
    })
  }

  const runBulkTrash = () => {
    if (!onBulkMoveToTrash || selectedIds.length === 0) return
    Modal.confirm({
      title: 'Move to trash',
      content: `Move ${selectedIds.length} ticket(s) to trash? You can open Trash from the sidebar to review or restore.`,
      okText: 'Move to trash',
      cancelText: 'Cancel',
      onOk: async () => {
        await onBulkMoveToTrash(selectedIds)
        setSelectedRowKeys([])
      },
    })
  }

  return (
    <div style={{ width: '100%' }}>
      {bulkEnabled && selectedIds.length > 0 ? (
        <Flex
          align="center"
          wrap="wrap"
          gap={8}
          style={{ padding: '0 24px 12px' }}
        >
          <span style={{ color: 'var(--ant-color-text-secondary, #8c8c8c)', fontSize: 13 }}>
            {selectedIds.length} selected
          </span>
          {!inSpamFolder && onBulkMoveToSpam ? (
            <Button type="default" icon={<WarningOutlined />} onClick={runBulkSpam}>
              Move to spam
            </Button>
          ) : null}
          {!inTrashFolder && onBulkMoveToTrash ? (
            <Button type="default" icon={<InboxOutlined />} onClick={runBulkTrash}>
              Move to trash
            </Button>
          ) : null}
        </Flex>
      ) : null}
    <Table
      rowKey="id"
      dataSource={sortedTickets}
      scroll={{ x: 'max-content' }}
      style={{ width: '100%', paddingRight: 24, paddingLeft: 24 }}
      rowSelection={
        bulkEnabled
          ? {
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              columnWidth: 40,
            }
          : undefined
      }
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: sortedTickets.length,
        showSizeChanger: true,
        pageSizeOptions: ['10', '15', '20', '50'],
        showTotal: (t) => `Total ${t} tickets`,
        onChange: (page, ps) =>
          setPagination((prev) => ({ current: page, pageSize: ps ?? prev.pageSize })),
        onShowSizeChange: (_page, size) => setPagination({ current: 1, pageSize: size }),
      }}
      size="middle"
      columns={[
        {
          title: '#',
          dataIndex: 'id',
          key: 'id',
          width: 72,
          align: 'center',
          render: (id: number) => <span style={{ color: '#8c8c8c', fontWeight: 500 }}>#{id}</span>,
        },
        {
          title: 'Title',
          dataIndex: 'title',
          key: 'title',
          ellipsis: true,
          render: (title: string, record: TicketRecord) => (
            <a
              href={`/tickets/${record.id}`}
              style={{ cursor: 'pointer', color: '#1677ff', padding: 0, height: 'auto', textDecoration: 'underline' }}
              onClick={(e) => {
                if (e.button !== 0) return
                if (e.ctrlKey || e.metaKey) return
                e.preventDefault()
                router.push(`/tickets/${record.id}`)
              }}
            >
              {record.has_unread_replies && (
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
              )}
              {title && title.length > 50 ? title.slice(0, 50) + '...' : title}
            </a>
          ),
        },
        {
          title: 'Company',
          dataIndex: ['company', 'name'],
          key: 'company',
          ellipsis: true,
          render: (_: unknown, record: TicketRecord) =>
            record.company ? (
              <span
                style={{
                  color: onFilterByCompany ? '#1677ff' : undefined,
                  cursor: onFilterByCompany ? 'pointer' : undefined,
                  textDecoration: onFilterByCompany ? 'underline' : undefined,
                }}
                title={onFilterByCompany ? 'Filter by this company' : undefined}
                onClick={
                  onFilterByCompany
                    ? (e) => {
                        e.stopPropagation()
                        onFilterByCompany(record.company!.id)
                      }
                    : undefined
                }
              >
                {record.company.name}
              </span>
            ) : '—',
        },
       
        {
          title: 'Priority',
          key: 'priority',
          width: 100,
          align: 'center',
          render: (_: unknown, record: TicketRecord) => (
            <Tag
              style={{
                borderRadius: '10px',
                backgroundColor: '#E8E8E8',
                padding: '4px 8px',
                minWidth: '48px',
                textAlign: 'center',
                fontWeight: 500,
                margin: 0,
              }}
            >
              {record.priority != null && record.priority > 0 ? `P${record.priority}` : '—'}
            </Tag>
          ),
        },
        {
          title: 'Type',
          key: 'type',
          width: 140,
          render: (_: unknown, record: TicketRecord) =>
            record.type ? (
              <Tag
                style={kanbanTagStyle({
                  ...(record.type.color ? { fillHex: record.type.color } : { neutral: true }),
                })}
              >
                {record.type.title}
              </Tag>
            ) : (
              '—'
            ),
        },
        {
          title: 'Tags',
          key: 'tags',
          width: 300,
          render: (_: unknown, record: TicketRecord) =>
            record.tags?.length ? (
              <Flex gap={6} wrap="wrap">
                {record.tags.map((t) => (
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
              </Flex>
            ) : (
              '—'
            ),
        },
        {
          title: 'Due date',
          dataIndex: 'due_date',
          key: 'due_date',
          width: 200,
          render: (_: unknown, record: TicketRecord) =>
            record.due_date ? (
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color:
                    new Date(record.due_date) < new Date() && !isClosedLikeTicketStatus(record.status)
                      ? '#ff4d4f'
                      : '#8c8c8c',
                }}
              >
                {new Date(record.due_date).toLocaleDateString()}
              </span>
            ) : '—',
        },
        {
          title: 'Team',
          key: 'team',
          width: 160,
          ellipsis: true,
          render: (_: unknown, record: TicketRecord) =>
            record.team_name ? (
              <Tag style={kanbanTagStyle({ fillHex: KANBAN_SEMANTIC_BLUE })}>Team {record.team_name}</Tag>
            ) : (
              '—'
            ),
        },
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          render: (status: string, record: TicketRecord) => {
            const col = allStatusColumns.find((c) => c.id === status)
            if (!col) return status
            return (
              <Tag
                style={{
                  borderRadius: '10px',
                  backgroundColor: col.color,
                  padding: '4px 16px',
                  minWidth: '100px',
                  textAlign: 'center',
                  fontWeight: 500,
                  color: '#000',
                  cursor: onFilterByStatus ? 'pointer' : undefined,
                }}
                title={onFilterByStatus ? 'Filter by this status' : undefined}
                onClick={
                  onFilterByStatus
                    ? (e) => {
                        e.stopPropagation()
                        onFilterByStatus(record.status)
                      }
                    : undefined
                }
              >
                {col.title}
              </Tag>
            )
          },
        },
        {
          title: '',
          key: 'actions',
          width: 80,
          render: (_: unknown, record: TicketRecord) => (
            <Space>
              <Tooltip title="Edit">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
              </Tooltip>
              {canDeleteTicket ? (
                <Tooltip title="Move to trash">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      Modal.confirm({
                        title: 'Move ticket to trash?',
                        content:
                          'The ticket will be hidden from the main list. You can open Trash from the sidebar to review.',
                        okText: 'Move to trash',
                        okButtonProps: { danger: true },
                        cancelText: 'Cancel',
                        onOk: () => onDelete(record.id),
                      })
                    }}
                  />
                </Tooltip>
              ) : null}
            </Space>
          ),
        },
      ]}
    />
  </div>
)
}
