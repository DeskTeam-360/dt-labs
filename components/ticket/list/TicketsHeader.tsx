'use client'

import { AppstoreOutlined, IdcardOutlined, PlusOutlined, SearchOutlined, TeamOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Button, Flex, Input, Segmented, Select, Typography } from 'antd'

import { TICKETS_PAGE_LIMIT_OPTIONS, type TicketsPageLimit } from '@/lib/tickets-list-query'

type ViewMode = 'kanban' | 'list' | 'card' | 'roundrobin'

interface TicketsHeaderProps {
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  onCreateClick: () => void
  loading?: boolean
  /** When true, hide Round Robin view option */
  isCustomer?: boolean
  filterSearch?: string
  onFilterSearchChange?: (v: string) => void
  /** Row classification list (staff junk folders) - spam/trash set title and hide view mode picker */
  filterTicketType?: 'spam' | 'trash' | null
  ticketsPageLimit?: TicketsPageLimit
  onTicketsPageLimitChange?: (v: TicketsPageLimit) => void
}

export default function TicketsHeader({
  viewMode,
  onViewModeChange,
  onCreateClick,
  loading = false,
  isCustomer = false,
  filterSearch = '',
  onFilterSearchChange,
  filterTicketType = null,
  ticketsPageLimit = 50,
  onTicketsPageLimitChange,
}: TicketsHeaderProps) {
  const inJunkFolder = !isCustomer && (filterTicketType === 'spam' || filterTicketType === 'trash')
  const junkTitle =
    filterTicketType === 'spam' ? 'Spam' : filterTicketType === 'trash' ? 'Trash' : null
  const viewOptions = [
    { label: <span style={{ marginRight: 8 }}><AppstoreOutlined /> Kanban</span>, value: 'kanban' },
    { label: <span style={{ marginRight: 8 }}><UnorderedListOutlined /> List</span>, value: 'list' },
    { label: <span style={{ marginRight: 8 }}><IdcardOutlined /> Card</span>, value: 'card' },
    ...(!isCustomer ? [{ label: <span style={{ marginRight: 8 }}><TeamOutlined /> Round Robin</span>, value: 'roundrobin' }] : []),
  ]

  return (
    <Flex justify="space-between" align="flex-start" gap={16} style={{ padding: 24 }} wrap="wrap">
      <Flex vertical gap={12} style={{ flex: 1, minWidth: 0 }}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={16}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {junkTitle ?? 'My Tickets'}
          </Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick} loading={loading}>
            Add Ticket
          </Button>
        </Flex>

        {!inJunkFolder && (
        <Flex>
        <Segmented
            value={isCustomer && viewMode === 'roundrobin' ? 'kanban' : viewMode}
            onChange={(v) => onViewModeChange(isCustomer && v === 'roundrobin' ? 'kanban' : (v as ViewMode))}
            options={viewOptions}
            size="large"
          />
        </Flex>
        )}

        <Flex align="center" gap={16} wrap="wrap">
          <Input
            placeholder="Title or description..."
            allowClear
            value={filterSearch}
            onChange={(e) => onFilterSearchChange?.(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            style={{ minWidth: 320, width: '100%', maxWidth: 400 }}
          />
{onTicketsPageLimitChange && (
            <Flex align="center" gap={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Load
              </Typography.Text>
              <Select
                value={ticketsPageLimit}
                onChange={(v) => onTicketsPageLimitChange(v as TicketsPageLimit)}
                options={TICKETS_PAGE_LIMIT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
                style={{ width: 72 }}
                aria-label="Tickets per load"
              />
            </Flex>
          )}
        </Flex>
      </Flex>
    </Flex>
  )
}
