'use client'

import { AppstoreOutlined, IdcardOutlined, PlusOutlined, SearchOutlined,SortAscendingOutlined, TeamOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, Flex, Input,Segmented, Select, Typography } from 'antd'

import type { TicketSortField, TicketSortOrder } from './types'

type ViewMode = 'kanban' | 'list' | 'card' | 'roundrobin'

interface TicketsHeaderProps {
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  onCreateClick: () => void
  loading?: boolean
  /** When true, hide Round Robin view option */
  isCustomer?: boolean
  /** Sort controls - shown when viewMode is kanban or card */
  sortBy?: TicketSortField
  sortOrder?: TicketSortOrder
  onSortByChange?: (v: TicketSortField) => void
  onSortOrderChange?: (v: TicketSortOrder) => void
  filterSearch?: string
  onFilterSearchChange?: (v: string) => void
}

const SORT_FIELD_OPTIONS: { value: TicketSortField; label: string }[] = [
  { value: 'id', label: 'ID' },
  { value: 'title', label: 'Title' },
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'created_at', label: 'Created' },
  // { value: 'company', label: 'Company' },
]

export default function TicketsHeader({
  viewMode,
  onViewModeChange,
  onCreateClick,
  loading = false,
  isCustomer = false,
  sortBy = 'updated_at',
  sortOrder = 'desc',
  onSortByChange,
  onSortOrderChange,
  filterSearch = '',
  onFilterSearchChange,
}: TicketsHeaderProps) {
  const viewOptions = [
    { label: <span style={{ marginRight: 8 }}><AppstoreOutlined /> Kanban</span>, value: 'kanban' },
    { label: <span style={{ marginRight: 8 }}><UnorderedListOutlined /> List</span>, value: 'list' },
    { label: <span style={{ marginRight: 8 }}><IdcardOutlined /> Card</span>, value: 'card' },
    ...(!isCustomer ? [{ label: <span style={{ marginRight: 8 }}><TeamOutlined /> Round Robin</span>, value: 'roundrobin' }] : []),
  ]
  const showSort = (viewMode === 'kanban' || viewMode === 'card') && onSortByChange && onSortOrderChange

  return (
    <Flex justify="space-between" align="flex-start" gap={16} style={{ padding: 24 }} wrap="wrap">
      <Flex vertical gap={12} style={{ flex: 1, minWidth: 0 }}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={16}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            My Tickets
          </Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick} loading={loading}>
            Add Ticket
          </Button>
        </Flex>

        <Flex>
        <Segmented
            value={isCustomer && viewMode === 'roundrobin' ? 'kanban' : viewMode}
            onChange={(v) => onViewModeChange(isCustomer && v === 'roundrobin' ? 'kanban' : (v as ViewMode))}
            options={viewOptions}
            size="large"
          />
        </Flex>

        <Flex align="center" gap={16} wrap="wrap">
     
          <Input
            placeholder="Title or description..."
            allowClear
            value={filterSearch}
            onChange={(e) => onFilterSearchChange?.(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            style={{ minWidth: 320, width: '100%', maxWidth: 400 }}
          />
         
          {showSort && (
            <Flex align="center" gap={8}>
              <SortAscendingOutlined style={{ color: '#8c8c8c' }} />
              <Select
                value={sortBy}
                onChange={onSortByChange}
                options={SORT_FIELD_OPTIONS}
                style={{ width: 130 }}
              />
              <Select
                value={sortOrder}
                onChange={onSortOrderChange}
                options={[
                  { value: 'asc', label: 'Asc' },
                  { value: 'desc', label: 'Desc' },
                ]}
                style={{ width: 90 }}
              />
            </Flex>
          )}
        </Flex>
      </Flex>
    </Flex>
  )
}
