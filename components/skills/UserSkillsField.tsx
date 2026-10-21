'use client'

import { Flex, InputNumber, message, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

import SkillsSelect, { useSkillCatalog } from './SkillsSelect'

const { Text } = Typography

type Item = { skill_id: string; level: number }

/** What each level means, so everyone scores the same way. */
const LEVEL_GUIDE = '1-3: just learning · 4-6: can do it with some help · 7-8: works independently · 9-10: can teach others'
const DEFAULT_LEVEL = 5

/**
 * Skills a user has, each with a level from 1 (beginner) to 10 (expert).
 * Loads and saves on its own; `readOnly` for people who may not edit.
 */
export default function UserSkillsField({ userId, readOnly = false }: { userId: string; readOnly?: boolean }) {
  const { skills: catalog } = useSkillCatalog()
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

  /** Add/remove right away; level edits wait a moment so typing 10 does not save 1 first. */
  const apply = (next: Item[], debounce = false) => {
    const previous = items
    setItems(next)
    if (timer.current) clearTimeout(timer.current)
    if (debounce) timer.current = setTimeout(() => void persist(next, previous), 600)
    else void persist(next, previous)
  }

  const nameOf = (id: string) => catalog.find((s) => s.id === id)

  return (
    <Flex vertical gap={8} style={{ width: '100%' }}>
      <SkillsSelect
        value={items.map((i) => i.skill_id)}
        onChange={(ids) => apply(ids.map((id) => items.find((i) => i.skill_id === id) ?? { skill_id: id, level: DEFAULT_LEVEL }))}
        loading={loading || saving}
        disabled={loading || readOnly}
        placeholder={readOnly ? 'No skills' : 'Add skills'}
      />
      {items.length > 0 ? (
        <Flex vertical gap={4}>
          {items.map((i) => {
            const s = nameOf(i.skill_id)
            return (
              <Flex key={i.skill_id} align="center" justify="space-between" gap={8}>
                <Tag color={s?.color} style={{ margin: 0 }}>{s?.name ?? '…'}</Tag>
                {readOnly ? (
                  <Tooltip title={LEVEL_GUIDE}>
                    <Text strong style={{ cursor: 'help' }}>{i.level}/10</Text>
                  </Tooltip>
                ) : (
                  <Flex align="center" gap={6}>
                    <Tooltip title={LEVEL_GUIDE}>
                      <Text type="secondary" style={{ fontSize: 12, cursor: 'help' }}>Level</Text>
                    </Tooltip>
                    <InputNumber
                      size="small"
                      min={1}
                      max={10}
                      precision={0}
                      value={i.level}
                      style={{ width: 64 }}
                      onChange={(v) => {
                        if (v == null) return
                        apply(items.map((x) => (x.skill_id === i.skill_id ? { ...x, level: Number(v) } : x)), true)
                      }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>/ 10</Text>
                  </Flex>
                )}
              </Flex>
            )
          })}
        </Flex>
      ) : null}
    </Flex>
  )
}
