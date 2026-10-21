'use client'

import { message } from 'antd'
import { useEffect, useState } from 'react'

import SkillsSelect, { PrimarySkillSelect } from './SkillsSelect'

/** Skills a ticket needs. Loads and saves on its own (no Save button). */
export default function TicketSkillsField({ ticketId }: { ticketId: number }) {
  const [ids, setIds] = useState<string[]>([])
  const [primary, setPrimary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/tickets/${ticketId}/skills`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { skill_ids: [] }))
      .then((j: { skill_ids?: string[]; primary_skill_id?: string | null }) => {
        if (cancelled) return
        setIds(j.skill_ids ?? [])
        setPrimary(j.primary_skill_id ?? null)
      })
      .catch(() => {
        if (!cancelled) setIds([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ticketId])

  const save = async (next: string[], nextPrimary: string | null) => {
    const prev = { ids, primary }
    const cleanPrimary = nextPrimary && next.includes(nextPrimary) ? nextPrimary : null
    setIds(next)
    setPrimary(cleanPrimary)
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/skills`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_ids: next, primary_skill_id: cleanPrimary }),
      })
      if (!res.ok) throw new Error('Failed to save skills')
    } catch (e) {
      setIds(prev.ids)
      setPrimary(prev.primary)
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SkillsSelect value={ids} onChange={(v) => void save(v, primary)} loading={loading || saving} disabled={loading} placeholder="Skills needed" />
      <PrimarySkillSelect skillIds={ids} value={primary} onChange={(p) => void save(ids, p)} loading={saving} disabled={loading} />
    </div>
  )
}
