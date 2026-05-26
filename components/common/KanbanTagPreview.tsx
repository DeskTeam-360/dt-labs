'use client'

import { Tag } from 'antd'

import { kanbanTagStyle, normalizeAccentHex } from '@/lib/kanban-tag-chip-style'

export function tagPreviewFillHex(hex: unknown, fallback = '#000000'): string {
  if (typeof hex !== 'string') return fallback
  const trimmed = hex.trim()
  if (!trimmed) return fallback
  const accent = normalizeAccentHex(trimmed)
  const body = accent.replace(/^#/, '')
  if (/^[0-9A-Fa-f]{6}$/.test(body)) return `#${body}`
  return fallback
}

const PREVIEW_PANELS = [
  {
    key: 'light',
    className: 'kanban-tag-preview-panel--light',
    label: 'Light card',
  },
  {
    key: 'dark',
    className: 'kanban-tag-preview-panel--dark',
    label: 'Dark card',
  },
] as const

export function KanbanTagPreview({
  name,
  colorHex,
  fallbackHex = '#000000',
  emptyLabel = 'Preview',
}: {
  name?: string
  colorHex?: unknown
  fallbackHex?: string
  emptyLabel?: string
}) {
  const label = (name ?? '').trim() || emptyLabel
  const fillHex = tagPreviewFillHex(colorHex, fallbackHex)
  const chipStyle = kanbanTagStyle({ fillHex })

  return (
    <div className="kanban-tag-preview-row">
      {PREVIEW_PANELS.map((panel) => (
        <div key={panel.key} className={panel.className}>
          <span className="kanban-tag-preview-panel__label">{panel.label}</span>
          <Tag style={chipStyle}>{label}</Tag>
        </div>
      ))}
    </div>
  )
}
