'use client'

import { Alert, message, Table, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'

import SkillsSelect, { PrimarySkillSelect } from '@/components/skills/SkillsSelect'

const { Text } = Typography

type Def = { skill_ids: string[]; primary_skill_id: string | null }
type TicketTypeRow = { id: number; title: string; color?: string | null }

/**
 * Default skills per ticket type for one company ("pre-skills").
 * A new ticket of that type starts with these skills; each ticket can still replace them.
 */
export default function TabCompanySkills({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [types, setTypes] = useState<TicketTypeRow[]>([])
  const [defaults, setDefaults] = useState<Record<string, Def>>({})
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetch('/api/ticket-types', { credentials: 'include' }).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/companies/${companyId}/skill-defaults`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : { defaults: {} })),
    ])
      .then(([t, d]) => {
        if (cancelled) return
        const arr = (Array.isArray(t) ? t : (t as { data?: TicketTypeRow[] }).data ?? []) as TicketTypeRow[]
        setTypes(arr)
        setDefaults((d as { defaults?: Record<string, Def> }).defaults ?? {})
      })
      .catch(() => {
        if (!cancelled) {
          setTypes([])
          setDefaults({})
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId])

  const save = async (typeId: number, ids: string[], primary: string | null) => {
    const prev = defaults[String(typeId)] ?? { skill_ids: [], primary_skill_id: null }
    const cleanPrimary = primary && ids.includes(primary) ? primary : null
    setDefaults((d) => ({ ...d, [String(typeId)]: { skill_ids: ids, primary_skill_id: cleanPrimary } }))
    setSavingType(typeId)
    try {
      const res = await fetch(`/api/companies/${companyId}/skill-defaults`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: typeId, skill_ids: ids, primary_skill_id: cleanPrimary }),
      })
      if (!res.ok) throw new Error('Failed to save default skills')
      message.success('Default skills saved')
    } catch (e) {
      setDefaults((d) => ({ ...d, [String(typeId)]: prev }))
      message.error((e as Error).message)
    } finally {
      setSavingType(null)
    }
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Default skills per ticket type"
        description="New tickets of a type start with these skills. They are only a starting point: each ticket can add or replace skills."
      />
      <Table<TicketTypeRow>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={types}
        pagination={false}
        columns={[
          {
            title: 'Ticket type',
            dataIndex: 'title',
            width: 240,
            render: (v: string, t) => (t.color ? <Tag color={t.color}>{v}</Tag> : <Text strong>{v}</Text>),
          },
          {
            title: 'Default skills',
            key: 'skills',
            render: (_: unknown, t) => {
              const d = defaults[String(t.id)] ?? { skill_ids: [], primary_skill_id: null }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkillsSelect
                    value={d.skill_ids}
                    onChange={(ids) => void save(t.id, ids, d.primary_skill_id)}
                    disabled={!canEdit}
                    loading={savingType === t.id}
                    placeholder={canEdit ? 'No default skills' : '—'}
                  />
                  <PrimarySkillSelect
                    skillIds={d.skill_ids}
                    value={d.primary_skill_id}
                    onChange={(p) => void save(t.id, d.skill_ids, p)}
                    disabled={!canEdit}
                    loading={savingType === t.id}
                  />
                </div>
              )
            },
          },
        ]}
      />
    </div>
  )
}
