'use client'

import { Select, Tag } from 'antd'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'

export type Skill = { id: string; name: string; color: string }

/** Loads the skill catalog; `create` adds a new skill (admin/manager only on the server). */
export function useSkillCatalog() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/skills', { credentials: 'include' })
      setSkills(res.ok ? ((await res.json()) as Skill[]) : [])
    } catch {
      setSkills([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(async (name: string): Promise<Skill | null> => {
    const res = await fetch('/api/skills', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    const skill = (await res.json()) as Skill
    setSkills((prev) => (prev.some((s) => s.id === skill.id) ? prev : [...prev, skill].sort((a, b) => a.name.localeCompare(b.name))))
    return skill
  }, [])

  return { skills, loading, reload, create }
}

type Props = {
  value?: string[]
  onChange?: (ids: string[]) => void
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  /** Allow typing a new skill name and adding it to the catalog. */
  canCreate?: boolean
  size?: 'small' | 'middle'
  style?: React.CSSProperties
}

export default function SkillsSelect({ value, onChange, disabled, loading, placeholder = 'Select skills', canCreate: canCreateProp, size, style }: Props) {
  const { data: session } = useSession()
  const role = ((session?.user as { role?: string } | undefined)?.role ?? '').toLowerCase()
  // Only admin/manager can add to the catalog; others just pick from it.
  const canCreate = canCreateProp ?? (role === 'admin' || role === 'manager')
  const { skills, loading: catalogLoading, create } = useSkillCatalog()
  const [search, setSearch] = useState('')

  const trimmed = search.trim()
  const exists = skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())

  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      size={size}
      style={{ width: '100%', ...style }}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading || catalogLoading}
      value={value ?? []}
      searchValue={search}
      onSearch={setSearch}
      optionFilterProp="label"
      maxTagCount="responsive"
      onChange={(ids) => {
        onChange?.(ids.filter((id) => id !== '__new__'))
        setSearch('')
      }}
      options={[
        ...skills.map((s) => ({ value: s.id, label: s.name })),
        ...(canCreate && trimmed && !exists ? [{ value: '__new__', label: `Add “${trimmed}”` }] : []),
      ]}
      onSelect={async (v) => {
        if (v !== '__new__') return
        const created = await create(trimmed)
        const current = value ?? []
        if (created && !current.includes(created.id)) onChange?.([...current, created.id])
        setSearch('')
      }}
      tagRender={(p) => {
        const s = skills.find((x) => x.id === p.value)
        if (!s) return <span />
        return (
          <Tag color={s.color} closable={p.closable} onClose={p.onClose} style={{ marginInlineEnd: 4 }}>
            {s.name}
          </Tag>
        )
      }}
    />
  )
}

/** Optional "most important" skill, picked from the skills already chosen. */
export function PrimarySkillSelect({
  skillIds,
  value,
  onChange,
  disabled,
  loading,
}: {
  skillIds: string[]
  value?: string | null
  onChange?: (id: string | null) => void
  disabled?: boolean
  loading?: boolean
}) {
  const { skills } = useSkillCatalog()
  if (skillIds.length < 2) return null
  return (
    <Select
      allowClear
      size="small"
      style={{ width: '100%' }}
      placeholder="Primary skill (optional)"
      disabled={disabled}
      loading={loading}
      value={value && skillIds.includes(value) ? value : undefined}
      onChange={(v) => onChange?.(v ?? null)}
      options={skillIds.map((id) => ({ value: id, label: `Primary: ${skills.find((s) => s.id === id)?.name ?? id}` }))}
    />
  )
}
