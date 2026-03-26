'use client'

import { Button, Dropdown, Form, Input, Select, Space } from 'antd'
import { PlusOutlined, CloseOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import type { AutomationActions } from '@/lib/automation-actions-types'
import CommentWysiwyg from './TicketDetail/CommentWysiwyg'

type ActionType = 'team_id' | 'priority_slug' | 'type_slug' | 'tag_ids' | 'visibility' | 'add_note' | 'add_checklist_items'

interface LookupData {
  teams: { id: string; name: string }[]
  ticketTypes: { id: number; title: string; slug: string; color?: string }[]
  ticketPriorities: { id: number; title: string; slug: string; color?: string }[]
  tags: { id: string; name: string; slug: string; color?: string }[]
  users?: { id: string; full_name?: string; email?: string }[]
}

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'team', label: 'Team' },
  { value: 'specific_users', label: 'Specific Users' },
  { value: 'public', label: 'Public' },
]

const ACTION_LABELS: Record<ActionType, string> = {
  team_id: 'Assign to Team',
  priority_slug: 'Set Priority',
  type_slug: 'Set Type',
  tag_ids: 'Add Tags',
  visibility: 'Set Visibility',
  add_note: 'Add Note',
  add_checklist_items: 'Add Checklist',
}

interface ActionBuilderProps {
  value?: AutomationActions | null
  onChange?: (value: AutomationActions) => void
}

async function fetchLookup() {
  const res = await fetch('/api/tickets/lookup', { credentials: 'include' })
  if (!res.ok) return null
  return res.json() as Promise<LookupData>
}

export default function ActionBuilder({ value, onChange = () => {} }: ActionBuilderProps) {
  const [lookup, setLookup] = useState<LookupData | null>(null)

  useEffect(() => {
    fetchLookup().then(setLookup)
  }, [])

  const ACTION_TYPES: ActionType[] = ['team_id', 'priority_slug', 'type_slug', 'tag_ids', 'visibility', 'add_note', 'add_checklist_items']
  const actions = value && typeof value === 'object' ? value : {}
  const shownKeys = ACTION_TYPES.filter(
    (k) => (actions as Record<string, unknown>)[k] !== undefined
  )

  const update = (key: keyof AutomationActions, val: unknown) => {
    const next = { ...actions }
    /** Quill memanggil onChange saat mount dengan HTML “kosong”; jangan hapus baris Add Note. */
    if (key === 'add_note') {
      if (val === undefined || val === null) {
        delete next.add_note
        delete next.add_note_user_id
      } else {
        ;(next as Record<string, unknown>).add_note = val
      }
      onChange(next as AutomationActions)
      return
    }
    if (val === undefined || val === null || val === '') {
      delete next[key]
      if (key === 'add_checklist_items') delete next.add_checklist_items
    } else {
      ;(next as Record<string, unknown>)[key] = val
    }
    onChange(next as AutomationActions)
  }

  const addAction = (type: ActionType) => {
    const next = { ...actions }
    if (type === 'tag_ids') {
      ;(next as Record<string, unknown>).tag_ids = []
    } else if (type === 'add_note') {
      ;(next as Record<string, unknown>).add_note = ''
      ;(next as Record<string, unknown>).add_note_user_id = lookup?.users?.[0]?.id || undefined
    } else if (type === 'add_checklist_items') {
      ;(next as Record<string, unknown>).add_checklist_items = []
    } else {
      ;(next as Record<string, unknown>)[type] = ''
    }
    onChange(next as AutomationActions)
  }

  const removeAction = (type: ActionType) => {
    const next = { ...actions }
    delete (next as Record<string, unknown>)[type]
    if (type === 'add_note') delete (next as Record<string, unknown>).add_note_user_id
    if (type === 'add_checklist_items') delete (next as Record<string, unknown>).add_checklist_items
    onChange(next as AutomationActions)
  }

  const availableToAdd = (['team_id', 'priority_slug', 'type_slug', 'tag_ids', 'visibility', 'add_note', 'add_checklist_items'] as ActionType[]).filter(
    (t) => !shownKeys.includes(t)
  )

  if (!lookup) {
    return <div style={{ padding: 16, color: '#999' }}>Loading options…</div>
  }

  return (
    <div
      style={{
        padding: 16,
        background: '#fafafa',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
      }}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {shownKeys.length === 0 ? (
          <div style={{ color: '#999', padding: '8px 0' }}>No actions configured</div>
        ) : (
          shownKeys.map((type) => (
            <div
              key={type}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: 12,
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #eee',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {type === 'team_id' && (
                  <Form.Item label={ACTION_LABELS.team_id} style={{ marginBottom: 0 }}>
                    <Select
                      allowClear
                      placeholder="Select team"
                      style={{ width: '100%' }}
                      value={(actions as Record<string, unknown>).team_id}
                      onChange={(v) => update('team_id', v)}
                      options={lookup.teams.map((t) => ({ value: t.id, label: t.name }))}
                    />
                  </Form.Item>
                )}
                {type === 'priority_slug' && (
                  <Form.Item label={ACTION_LABELS.priority_slug} style={{ marginBottom: 0 }}>
                    <Select
                      allowClear
                      placeholder="Select priority"
                      style={{ width: '100%' }}
                      value={(actions as Record<string, unknown>).priority_slug}
                      onChange={(v) => update('priority_slug', v)}
                      options={lookup.ticketPriorities.map((p) => ({
                        value: p.slug,
                        label: p.title,
                      }))}
                    />
                  </Form.Item>
                )}
                {type === 'type_slug' && (
                  <Form.Item label={ACTION_LABELS.type_slug} style={{ marginBottom: 0 }}>
                    <Select
                      allowClear
                      placeholder="Select type"
                      style={{ width: '100%' }}
                      value={(actions as Record<string, unknown>).type_slug}
                      onChange={(v) => update('type_slug', v)}
                      options={lookup.ticketTypes.map((t) => ({
                        value: t.slug,
                        label: t.title,
                      }))}
                    />
                  </Form.Item>
                )}
                {type === 'tag_ids' && (
                  <Form.Item label={ACTION_LABELS.tag_ids} style={{ marginBottom: 0 }}>
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="Select tags"
                      style={{ width: '100%' }}
                      value={(actions as Record<string, unknown>).tag_ids as string[] | undefined}
                      onChange={(v) => update('tag_ids', v?.length ? v : undefined)}
                      options={lookup.tags.map((t) => ({
                        value: t.id,
                        label: t.name,
                      }))}
                    />
                  </Form.Item>
                )}
                {type === 'visibility' && (
                  <Form.Item label={ACTION_LABELS.visibility} style={{ marginBottom: 0 }}>
                    <Select
                      allowClear
                      placeholder="Select visibility"
                      style={{ width: '100%' }}
                      value={(actions as Record<string, unknown>).visibility}
                      onChange={(v) => update('visibility', v)}
                      options={VISIBILITY_OPTIONS}
                    />
                  </Form.Item>
                )}
                {type === 'add_note' && (
                  <>
                    <Form.Item label={ACTION_LABELS.add_note} style={{ marginBottom: 8 }}>
                      <CommentWysiwyg
                        placeholder="Enter note (rich text). Images upload to draft storage."
                        height="200px"
                        value={((actions as Record<string, unknown>).add_note as string | undefined) ?? ''}
                        onChange={(html) => update('add_note', html)}
                      />
                    </Form.Item>
                    <Form.Item label="Note author" style={{ marginBottom: 0 }}>
                      <Select
                        allowClear={false}
                        placeholder="Select user"
                        style={{ width: '100%' }}
                        value={(actions as Record<string, unknown>).add_note_user_id}
                        onChange={(v) => update('add_note_user_id', v)}
                        options={(lookup.users || []).map((u) => ({
                          value: u.id,
                          label: u.full_name || u.email || u.id,
                        }))}
                      />
                    </Form.Item>
                  </>
                )}
                {type === 'add_checklist_items' && (
                  <Form.Item label={ACTION_LABELS.add_checklist_items} style={{ marginBottom: 0 }}>
                    <Input.TextArea
                      placeholder="One item per line (e.g.&#10;Verify customer info&#10;Check payment&#10;Send confirmation)"
                      rows={5}
                      value={((actions as Record<string, unknown>).add_checklist_items as string[] | undefined)?.join('\n') ?? ''}
                      onChange={(e) => {
                        const lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                        update('add_checklist_items', lines.length ? lines : undefined)
                      }}
                    />
                  </Form.Item>
                )}
              </div>
              <Button
                type="primary"
                color='danger'

                icon={<CloseOutlined />}
                onClick={() => removeAction(type)}
              />
            </div>
          ))
        )}

        {availableToAdd.length > 0 && (
          <Dropdown
            menu={{
              items: availableToAdd.map((t) => ({
                key: t,
                label: ACTION_LABELS[t],
                onClick: () => addAction(t),
              })),
            }}
            trigger={['click']}
          >
            <Button type="dashed" icon={<PlusOutlined />} block>
              Add Action
            </Button>
          </Dropdown>
        )}
      </Space>
    </div>
  )
}
