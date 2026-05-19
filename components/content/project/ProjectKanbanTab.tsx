'use client'

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { message } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import TicketsKanbanView from '@/components/ticket/list/TicketsKanbanView'
import type { StatusColumn, TicketRecord } from '@/components/ticket/list/types'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export interface ProjectStatusRow {
  id: number
  title: string
  color: string
  sort_order: number
}

interface ProjectKanbanTabProps {
  statuses: ProjectStatusRow[]
  boardTickets: TicketRecord[]
  onRefresh: () => void
}

export default function ProjectKanbanTab({ statuses, boardTickets, onRefresh }: ProjectKanbanTabProps) {
  const router = useRouter()
  const [activeId, setActiveId] = useState<number | null>(null)

  const columnsToShow = useMemo<StatusColumn[]>(
    () =>
      [...statuses]
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        .map((s) => ({ id: `ps-${s.id}`, title: s.title, color: s.color })),
    [statuses]
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const raw = event.active.id
    const id = typeof raw === 'string' ? Number.parseInt(raw, 10) : (raw as number)
    setActiveId(Number.isFinite(id) ? id : null)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      if (!over) return

      const activeRaw = active.id
      const ticketId =
        typeof activeRaw === 'string' ? Number.parseInt(activeRaw, 10) : (activeRaw as number)
      if (Number.isNaN(ticketId)) return

      const overId = over.id
      const overAsColumnId = String(overId)
      let columnKey: string
      if (columnsToShow.some((c) => c.id === overAsColumnId)) {
        columnKey = overAsColumnId
      } else {
        const overNum =
          typeof overId === 'string' ? Number.parseInt(overId, 10) : (overId as number)
        const hit = boardTickets.find((t) => t.id === overNum)
        if (!hit) return
        columnKey = hit.status as string
      }

      const m = columnKey.match(/^ps-(\d+)$/)
      if (!m) return
      const nextPs = Number.parseInt(m[1], 10)
      if (Number.isNaN(nextPs)) return

      try {
        await apiFetch(`/api/tickets/${ticketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_status_id: nextPs }),
        })
        message.success('Card moved')
        onRefresh()
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : 'Failed to move card')
      }
    },
    [boardTickets, columnsToShow, onRefresh]
  )

  return (
    <TicketsKanbanView
      tickets={boardTickets}
      columnsToShow={columnsToShow}
      activeId={activeId}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onEdit={(t) => router.push(`/tickets/${t.id}`)}
      onDelete={() => {}}
      canDeleteTicket={false}
      allStatusColumns={columnsToShow}
    />
  )
}
