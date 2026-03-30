'use client'

import { useState, useEffect } from 'react'
import {
  Table,
  Tag,
  Button,
  Dropdown,
  Space,
  Tooltip,
  Avatar,
  Modal,
  Flex,
} from 'antd'
import { EditOutlined, DeleteOutlined, UserOutlined, MoreOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import DateDisplay from '../DateDisplay'
import type { TicketRecord, StatusColumn } from './types'
import { darkenColor } from './types'

type PriorityOption = { id: number; title: string; slug: string; color: string; sortOrder?: number }

interface TicketsListViewProps {
  tickets: TicketRecord[]
  allStatusColumns: StatusColumn[]
  allPriorities?: PriorityOption[]
  onEdit: (ticket: TicketRecord) => void
  onDelete: (id: number) => void
}

export default function TicketsListView({
  tickets,
  allStatusColumns,
  allPriorities = [],
  onEdit,
  onDelete,
}: TicketsListViewProps) {
  const router = useRouter()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 })

  useEffect(() => {
    setPagination((p) => {
      const totalPages = Math.max(1, Math.ceil(tickets.length / p.pageSize))
      if (p.current <= totalPages) return p
      return { ...p, current: totalPages }
    })
  }, [tickets.length, pagination.pageSize])

  const getPriorityOrder = (record: TicketRecord) => {
    if (!record.priority) return 999
    const idx = allPriorities.findIndex((p) => p.id === record.priority!.id)
    return idx >= 0 ? idx : 999
  }
  return (
    <Table
      rowKey="id"
      dataSource={tickets}
      scroll={{ x: 'max-content' }}
      style={{ width: '100%', paddingRight: 24, paddingLeft: 24 }}
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: tickets.length,
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
          sorter: (a: TicketRecord, b: TicketRecord) => a.id - b.id,
          render: (id: number) => <span style={{ color: '#8c8c8c', fontWeight: 500 }}>#{id}</span>,
        },
        {
          title: 'Title',
          dataIndex: 'title',
          key: 'title',
          ellipsis: true,
          sorter: (a: TicketRecord, b: TicketRecord) => (a.title || '').localeCompare(b.title || ''),
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
          sorter: (a: TicketRecord, b: TicketRecord) => (a.company?.name || '').localeCompare(b.company?.name || ''),
          render: (_: unknown, record: TicketRecord) =>
            record.company ? (
                <>{record.company.name}</>
              
            ) : '—',
        },
       
        {
          title: 'Priority',
          key: 'priority',
          width: 100,
          sorter: (a: TicketRecord, b: TicketRecord) => getPriorityOrder(a) - getPriorityOrder(b),
          render: (_: unknown, record: TicketRecord) =>
            record.priority ? (
              <Tag
                style={{
                  borderRadius: '10px',
                  backgroundColor: record.priority.color,
                  padding: '4px 8px',
                  width: '60px',
                  textAlign: 'center',
                  fontWeight: 500,
                  color:
                     (() => {
                          // Auto-detect text color for contrast
                          const c = record.priority.color?.replace('#', '')
                          if (!c || c.length !== 6) return '#111'
                          const r = parseInt(c.substr(0,2),16)
                          const g = parseInt(c.substr(2,2),16)
                          const b = parseInt(c.substr(4,2),16)
                          // luminance formula
                          const luminance = (0.299*r + 0.587*g + 0.114*b)/255
                          return luminance > 0.7 ? '#111' : '#fff'
                        })()
                }}
              >
                {record.priority.title}
              </Tag>
            ) : '—',
        },
        {
          title: 'Type',
          key: 'type',
          width: 120,
          sorter: (a: TicketRecord, b: TicketRecord) => (a.type?.title || '').localeCompare(b.type?.title || ''),
          render: (_: unknown, record: TicketRecord) =>
            record.type ? <Tag style={{ borderRadius: '10px',backgroundColor: '#E8E8E8', padding: '4px 8px', minWidth:'70px', textAlign: 'center', fontWeight: 500, color: record.type.color }}>{record.type.title}</Tag> : '—',
        },
       
        
        {
          title: 'Tags',
          key: 'tags',
          width: 300,
          sorter: (a: TicketRecord, b: TicketRecord) => (a.tags?.length || 0) - (b.tags?.length || 0),
          render: (_: unknown, record: TicketRecord) =>
            record.tags?.length ? (
              <Flex gap={4} wrap="wrap">
                {record.tags.slice(0, 3).map((t) => (
                  <Tag key={t.id} color={t.color ? undefined : 'default'} style={t.color ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' } : undefined}>
                    {t.name}
                  </Tag>
                ))}
                {record.tags.length > 3 && <span style={{ fontSize: 12, color: '#8c8c8c' }}>+{record.tags.length - 3}</span>}
              </Flex>
            ) : '—',
        },
        {
          title: 'Due date',
          dataIndex: 'due_date',
          key: 'due_date',
          width: 200,
          sorter: (a: TicketRecord, b: TicketRecord) =>
            new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime(),
          render: (_: unknown, record: TicketRecord) =>
            record.due_date ? (
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color:
                    new Date(record.due_date) < new Date() &&
                    record.status !== 'completed' &&
                    record.status !== 'cancel'
                      ? '#ff4d4f'
                      : '#8c8c8c',
                }}
              >
                {new Date(record.due_date).toLocaleDateString()}
              </span>
            ) : '—',
        },
        {
          title: 'Assignees',
          key: 'assignees',
          width: 120,
          sorter: (a: TicketRecord, b: TicketRecord) => (a.assignees?.length || 0) - (b.assignees?.length || 0),
          render: (_: unknown, record: TicketRecord) =>
            record.assignees?.length ? (
              <Avatar.Group size="small" maxCount={2}>
                {record.assignees.map((a) => (
                  <Tooltip key={a.id} title={a.user_name}>
                    <Avatar size="small" icon={<UserOutlined />} />
                  </Tooltip>
                ))}
              </Avatar.Group>
            ) : '—',
        },
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          sorter: (a: TicketRecord, b: TicketRecord) => (a.status || '').localeCompare(b.status || ''),
          render: (status: string) => {
            const col = allStatusColumns.find((c) => c.id === status)
            return col ? <Tag style={{ borderRadius: '10px',backgroundColor: col.color, padding: '4px 16px', minWidth:'100px', textAlign: 'center', fontWeight: 500, color: '#000' }}>{col.title}</Tag> : status
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
              <Dropdown
                menu={{
                  items: [
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
                          onOk: () => onDelete(record.id),
                        })
                      },
                    },
                  ],
                }}
                trigger={['click']}
              >
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          ),
        },
      ]}
    />
  )
}
