'use client'

import { Button, Flex, Typography, Segmented } from 'antd'
import { PlusOutlined, AppstoreOutlined, UnorderedListOutlined, IdcardOutlined, TeamOutlined } from '@ant-design/icons'

type ViewMode = 'kanban' | 'list' | 'card' | 'roundrobin'

interface TicketsHeaderProps {
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  onCreateClick: () => void
  loading?: boolean
}

export default function TicketsHeader({
  viewMode,
  onViewModeChange,
  onCreateClick,
  loading = false,
}: TicketsHeaderProps) {
  return (
    <Flex justify="space-between" align="center" gap={16} style={{ marginBottom: 24, padding: 24 }} wrap="wrap">
      <Flex align="center" gap={16} wrap="wrap">
        <Typography.Title level={2} style={{ margin: 0 }}>
          My Tickets
        </Typography.Title>
        <Segmented
          value={viewMode}
          onChange={(v) => onViewModeChange(v as ViewMode)}
          options={[
            { label: <span style={{ marginRight: 8 }}><AppstoreOutlined /> Kanban</span>, value: 'kanban' },
            { label: <span style={{ marginRight: 8 }}><UnorderedListOutlined /> List</span>, value: 'list' },
            { label: <span style={{ marginRight: 8 }}><IdcardOutlined /> Card</span>, value: 'card' },
            { label: <span style={{ marginRight: 8 }}><TeamOutlined /> Round Robin</span>, value: 'roundrobin' },
          ]}
        />
      </Flex>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick} loading={loading}>
        Add Ticket
      </Button>
    </Flex>
  )
}
