'use client'

import { CloseOutlined } from '@ant-design/icons'
import { Button, Empty, Flex, message, Popconfirm, Progress, Select, Slider, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

import { useSkillCatalog } from './SkillsSelect'

const { Text } = Typography

type Item = { skill_id: string; level: number }

const DEFAULT_LEVEL = 5

/** What each level means, so everyone scores the same way. */
const LEVEL_GUIDE = '1-3: just learning · 4-6: can do it with some help · 7-8: works independently · 9-10: can teach others'

function band(level: number): { label: string; color: string } {
  if (level >= 9) return { label: 'Expert', color: '#722ed1' }
  if (level >= 7) return { label: 'Independent', color: '#52c41a' }
  if (level >= 4) return { label: 'Developing', color: '#1677ff' }
  return { label: 'Learning', color: '#fa8c16' }
}

/**
 * Skills a user has, each with a level from 1 (beginner) to 10 (expert).
 * Loads and saves on its own; `readOnly` for people who may not edit.
 */
export default function UserSkillsField({ userId, readOnly = false }: { userId: string; readOnly?: boolean }) {
  const { skills: catalog, loading: catalogLoading } = useSkillCatalog()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/users/${userId}/skills`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { skills: [] }))
      .then((j: { skills?: Item[] }) => {
        if (!cancelled) setItems(j.skills ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const persist = async (next: Item[], previous: Item[]) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${userId}/skills`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: next }),
      })
      if (!res.ok) throw new Error('Failed to save skills')
    } catch (e) {
      setItems(previous)
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** Add/remove right away; level edits wait a moment so dragging the slider does not save every step. */
  const apply = (next: Item[], debounce = false) => {
    const previous = items
    setItems(next)
    if (timer.current) clearTimeout(timer.current)
    if (debounce) timer.current = setTimeout(() => void persist(next, previous), 600)
    else void persist(next, previous)
  }

  const sorted = [...items].sort((a, b) => b.level - a.level)
  const owned = new Set(items.map((i) => i.skill_id))
  const addable = catalog.filter((s) => !owned.has(s.id))

  return (
    <Flex vertical gap={16} style={{ width: '100%' }}>
      {!readOnly ? (
        <Flex gap={8} align="center" wrap>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={catalogLoading ? 'Loading skills…' : addable.length ? 'Add a skill…' : 'All skills already added'}
            style={{ minWidth: 260 }}
            disabled={loading || catalogLoading || addable.length === 0}
            loading={saving}
            value={null}
            options={addable.map((s) => ({ value: s.id, label: s.name }))}
            onSelect={(id: string | null) => {
              if (id) apply([...items, { skill_id: id, level: DEFAULT_LEVEL }])
            }}
          />
          <Tooltip title={LEVEL_GUIDE}>
            <Text type="secondary" style={{ fontSize: 12, cursor: 'help' }}>How are levels scored?</Text>
          </Tooltip>
        </Flex>
      ) : null}

      {sorted.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? 'Loading…' : readOnly ? 'No skills yet' : 'No skills yet. Add the first one above.'} />
      ) : (
        <Flex vertical gap={10}>
          {sorted.map((i) => {
            const s = catalog.find((x) => x.id === i.skill_id)
            const b = band(i.level)
            return (
              <Flex
                key={i.skill_id}
                align="center"
                gap={16}
                style={{ padding: '10px 14px', border: '1px solid var(--ant-color-border-secondary, #f0f0f0)', borderRadius: 10 }}
              >
                <Tag color={s?.color} style={{ margin: 0, minWidth: 120, textAlign: 'center', fontSize: 13, padding: '2px 10px' }}>
                  {s?.name ?? '…'}
                </Tag>

                <div style={{ flex: 1, minWidth: 140 }}>
                  {readOnly ? (
                    <Progress percent={i.level * 10} showInfo={false} strokeColor={b.color} size="small" />
                  ) : (
                    <Slider
                      min={1}
                      max={10}
                      step={1}
                      value={i.level}
                      tooltip={{ formatter: (v) => `${v}/10` }}
                      styles={{ track: { background: b.color }, handle: { color: b.color } }}
                      onChange={(v) => apply(items.map((x) => (x.skill_id === i.skill_id ? { ...x, level: v } : x)), true)}
                      style={{ margin: '6px 0' }}
                    />
                  )}
                </div>

                <Flex vertical align="flex-end" style={{ minWidth: 92 }}>
                  <Text strong style={{ fontSize: 18, lineHeight: 1.1, color: b.color }}>
                    {i.level}
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}> / 10</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: b.color }}>{b.label}</Text>
                </Flex>

                {!readOnly ? (
                  <Popconfirm title="Remove this skill?" okText="Remove" onConfirm={() => apply(items.filter((x) => x.skill_id !== i.skill_id))}>
                    <Button type="text" size="small" icon={<CloseOutlined />} aria-label="Remove skill" />
                  </Popconfirm>
                ) : null}
              </Flex>
            )
          })}
        </Flex>
      )}
    </Flex>
  )
}
