'use client'

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
import DateDisplay from '../DateDisplay'
import type { TodoRecord, StatusColumn } from './types'
import { darkenColor } from './types'

interface TodosListViewProps {
  todos: TodoRecord[]
  allStatusColumns: StatusColumn[]
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: number) => void
}

export default function TodosListView({
  todos,
  allStatusColumns,
  onEdit,
  onDelete,
}: TodosListViewProps) {
  return (
    <Table
      rowKey="id"
      dataSource={todos}
      style={{ width: '100%', paddingRight: 24, paddingLeft: 24, }}
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} tickets` }}
      size="middle"
      columns={[
        {
          title: 'Title',
          dataIndex: 'title',
          key: 'title',
          ellipsis: true,
          render: (title: string, record: TodoRecord) => (
            <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => onEdit(record)}>
              {record.has_unread_replies && (
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', marginRight: 6, verticalAlign: 'middle' }} title="Unread replies" />
              )}
              #{record.id} {title}
            </Button>
          ),
        },
        {
          title: 'Status',
          dataIndex: 'status',
          key: 'status',
          width: 120,
          render: (status: string) => {
            const col = allStatusColumns.find((c) => c.id === status)
            return col ? <Tag color={col.color}>{col.title}</Tag> : status
          },
        },
        {
          title: 'Type',
          key: 'type',
          width: 120,
          render: (_: unknown, record: TodoRecord) =>
            record.type ? <Tag color={record.type.color}>{record.type.title}</Tag> : '—',
        },
        {
          title: 'Priority',
          key: 'priority',
          width: 100,
          render: (_: unknown, record: TodoRecord) =>
            record.priority ? (
              <Tag color={record.priority.color ? undefined : 'default'} style={record.priority.color ? { backgroundColor: record.priority.color, borderColor: darkenColor(record.priority.color), color: '#fff' } : undefined}>
                {record.priority.title}
              </Tag>
            ) : '—',
        },
        {
          title: 'Company',
          dataIndex: ['company', 'name'],
          key: 'company',
          width: 140,
          ellipsis: true,
          render: (_: unknown, record: TodoRecord) =>
            record.company ? (
              <Tag color={record.company.color ? undefined : 'cyan'} style={record.company.color ? { backgroundColor: record.company.color, borderColor: darkenColor(record.company.color), color: '#fff' } : undefined}>
                {record.company.name}
              </Tag>
            ) : '—',
        },
        {
          title: 'Tags',
          key: 'tags',
          width: 300,
          render: (_: unknown, record: TodoRecord) =>
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
          render: (due_date: string | null) =>
            due_date ? (
              <DateDisplay date={due_date} />
            ) : '—',
        },
        {
          title: 'Assignees',
          key: 'assignees',
          width: 120,
          render: (_: unknown, record: TodoRecord) =>
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
          title: '',
          key: 'actions',
          width: 80,
          render: (_: unknown, record: TodoRecord) => (
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
