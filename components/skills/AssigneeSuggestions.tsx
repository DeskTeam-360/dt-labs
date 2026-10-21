'use client'

import { BulbOutlined } from '@ant-design/icons'
import { Button, Empty, Flex, List, Popover, Spin, Tag, Typography } from 'antd'
import { useState } from 'react'

const { Text } = Typography

type Suggestion = {
  user_id: string
  name: string
  match_pct: number
  active_tickets: number
  matched: string[]
  missing: string[]
  level_note: string | null
}

/** "Suggest" button for the Assignees field. Only a hint: picking someone adds them to the draft, a person still saves. */
export default function AssigneeSuggestions({
  ticketId,
  assignedIds,
  onAdd,
}: {
  ticketId: number
  assignedIds: string[]
  onAdd: (userId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{ no_skills: boolean; suggestions: Suggestion[] } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assignee-suggestions`, { credentials: 'include' })
      setData(res.ok ? await res.json() : { no_skills: false, suggestions: [] })
    } catch {
      setData({ no_skills: false, suggestions: [] })
    } finally {
      setLoading(false)
    }
  }

  const content = loading ? (
    <Spin size="small" />
  ) : !data ? null : data.no_skills ? (
    <Text type="secondary">Add skills to this ticket first.</Text>
  ) : data.suggestions.length === 0 ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No one matches at least 50% of the skills (or everyone is off today)." />
  ) : (
    <List
      size="small"
      style={{ width: 320 }}
      dataSource={data.suggestions}
      renderItem={(s) => (
        <List.Item
          actions={[
            assignedIds.includes(s.user_id) ? (
              <Text key="a" type="secondary">Added</Text>
            ) : (
              <Button key="a" size="small" type="link" onClick={() => onAdd(s.user_id)}>Add</Button>
            ),
          ]}
        >
          <Flex vertical gap={2}>
            <Text strong>{s.name}</Text>
            <Flex gap={6} wrap>
              <Tag color={s.match_pct === 100 ? 'green' : 'gold'} style={{ margin: 0 }}>{s.match_pct}% match</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{s.active_tickets} active tickets</Text>
            </Flex>
            {s.level_note ? <Text style={{ fontSize: 12 }}>{s.level_note}</Text> : null}
            {s.missing.length > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>Missing: {s.missing.join(', ')}</Text> : null}
          </Flex>
        </List.Item>
      )}
    />
  )

  return (
    <Popover
      trigger="click"
      placement="left"
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) void load()
      }}
      title="Suggested assignees"
      content={content}
    >
      <Button type="link" size="small" icon={<BulbOutlined />} style={{ padding: 0, height: 'auto' }}>
        Suggest
      </Button>
    </Popover>
  )
}
