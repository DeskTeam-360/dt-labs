'use client'

import { CheckCircleOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Checkbox, Empty, Flex, Input, Popconfirm, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'
import type { ChecklistItemDto } from '@/lib/ticket-checklist-map'
import { linkifyPlainTextForHtml } from '@/lib/ticket-comment-summarize'

const { Text } = Typography

function ChecklistNoteCell({
  item,
  onSave,
}: {
  item: ChecklistItemDto
  onSave: (itemId: string, note: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(item.completion_note ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(item.completion_note ?? '')
  }, [item.id, item.completion_note])

  const saveIfChanged = async () => {
    const next = draft.trim()
    const prev = (item.completion_note ?? '').trim()
    if (next === prev) return
    setSaving(true)
    try {
      await onSave(item.id, draft)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Input.TextArea
      rows={2}
      value={draft}
      disabled={saving}
      placeholder="Add note here..."
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void saveIfChanged()}
      onPressEnter={(e) => {
        if (!e.shiftKey) {
          e.preventDefault()
          void saveIfChanged()
        }
      }}
      maxLength={2000}
      style={{ minWidth: 200 }}
    />
  )
}

export type TabChecklistProps = {
  checklistItems: ChecklistItemDto[]
  totalChecklistCount: number
  completedChecklistCount: number
  newChecklistTitle: string
  onNewChecklistTitleChange: (v: string) => void
  onAddChecklistItem: () => void
  onCompleteChecklistItem: (itemId: string) => Promise<void>
  onUncompleteChecklistItem: (itemId: string) => Promise<void>
  onUpdateChecklistNote: (itemId: string, completionNote: string) => Promise<void>
  onDeleteChecklistItem: (itemId: string) => void
}

export default function TabChecklist({
  checklistItems,
  totalChecklistCount,
  completedChecklistCount,
  newChecklistTitle,
  onNewChecklistTitleChange,
  onAddChecklistItem,
  onCompleteChecklistItem,
  onUncompleteChecklistItem,
  onUpdateChecklistNote,
  onDeleteChecklistItem,
}: TabChecklistProps) {
  const columns: ColumnsType<ChecklistItemDto> = useMemo(
    () => [
      {
        title: 'Done',
        key: 'done',
        width: 56,
        align: 'center',
        render: (_, item) => (
          <Checkbox
            checked={item.is_completed}
            onChange={() => {
              if (item.is_completed) {
                void onUncompleteChecklistItem(item.id)
              } else {
                void onCompleteChecklistItem(item.id)
              }
            }}
          />
        ),
      },
      {
        title: 'Task',
        dataIndex: 'title',
        key: 'title',
        render: (title: string, item) => (
          <div
            className="ql-editor comment-html"
            style={{
              margin: 0,
              padding: 0,
              minHeight: 'auto',
              fontSize: 14,
              textDecoration: item.is_completed ? 'line-through' : 'none',
              opacity: item.is_completed ? 0.75 : 1,
            }}
            dangerouslySetInnerHTML={{
              __html: sanitizeRichHtml(linkifyPlainTextForHtml(title)),
            }}
          />
        ),
      },
      {
        title: 'Completed by',
        key: 'completed_by',
        width: 140,
        render: (_, item) =>
          item.is_completed && item.completed_by_name ? (
            <Text style={{ fontSize: 13 }}>{item.completed_by_name}</Text>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Completed at',
        key: 'completed_at',
        width: 160,
        render: (_, item) =>
          item.is_completed && item.completed_at ? (
            <DateDisplay date={item.completed_at} />
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Note',
        key: 'note',
        width: '32%',
        render: (_, item) => (
          <ChecklistNoteCell item={item} onSave={onUpdateChecklistNote} />
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 56,
        align: 'center',
        render: (_, item) => (
          <Popconfirm
            title="Delete checklist item"
            description="Are you sure?"
            onConfirm={() => onDeleteChecklistItem(item.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger type="text" icon={<DeleteOutlined />} size="middle" />
          </Popconfirm>
        ),
      },
    ],
    [
      onCompleteChecklistItem,
      onUncompleteChecklistItem,
      onUpdateChecklistNote,
      onDeleteChecklistItem,
    ]
  )

  return (
    <Card
      title={
        <Space>
          <CheckCircleOutlined />
          <Text strong>Checklist</Text>
          {totalChecklistCount > 0 && (
            <Text type="secondary">
              ({completedChecklistCount}/{totalChecklistCount})
            </Text>
          )}
        </Space>
      }
      style={{ width: '100%' }}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {checklistItems.length > 0 ? (
          <Table<ChecklistItemDto>
            rowKey="id"
            size="small"
            pagination={false}
            columns={columns}
            dataSource={checklistItems}
            scroll={{ x: 900 }}
          />
        ) : (
          <Empty description="No checklist items" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        <Flex gap="small" align="center" style={{ width: '100%', maxWidth: 720 }}>
          <Input
            placeholder="Add checklist item..."
            value={newChecklistTitle}
            onChange={(e) => onNewChecklistTitleChange(e.target.value)}
            onPressEnter={onAddChecklistItem}
            style={{ flex: 1 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddChecklistItem}>
            Add
          </Button>
        </Flex>
      </Space>
    </Card>
  )
}
