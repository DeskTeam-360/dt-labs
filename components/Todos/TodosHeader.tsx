'use client'

import { Button, Flex, Typography, Segmented } from 'antd'
import { PlusOutlined, AppstoreOutlined, UnorderedListOutlined, IdcardOutlined } from '@ant-design/icons'

interface TodosHeaderProps {
  viewMode: 'kanban' | 'list' | 'card'
  onViewModeChange: (v: 'kanban' | 'list' | 'card') => void
  onCreateClick: () => void
  loading?: boolean
}

export default function TodosHeader({
  viewMode,
  onViewModeChange,
  onCreateClick,
  loading = false,
}: TodosHeaderProps) {
  return (
    <Flex justify="space-between" align="center" gap={16} style={{ marginBottom: 24, padding: 24 }} wrap="wrap">
      <Flex align="center" gap={16} wrap="wrap">
        <Typography.Title level={2} style={{ margin: 0 }}>
          My Tickets
        </Typography.Title>
        <Segmented
          value={viewMode}
          onChange={(v) => onViewModeChange(v as 'kanban' | 'list' | 'card')}
          options={[
            { label: <span style={{ marginRight: 8 }}><AppstoreOutlined /> Kanban</span>, value: 'kanban' },
            { label: <span style={{ marginRight: 8 }}><UnorderedListOutlined /> List</span>, value: 'list' },
            { label: <span style={{ marginRight: 8 }}><IdcardOutlined /> Card</span>, value: 'card' as 'kanban' | 'list' | 'card' },
          ]}
        />
      </Flex>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick} loading={loading}>
        Add Ticket
      </Button>
    </Flex>
  )
}
