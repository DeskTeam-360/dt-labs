'use client'

import { Tag, Typography } from 'antd'

import { kanbanTagStyle, normalizeAccentHex } from '@/lib/kanban-tag-chip-style'

const { Text } = Typography

export function tagPreviewFillHex(hex: unknown, fallback = '#000000'): string {
  if (typeof hex !== 'string') return fallback
  const trimmed = hex.trim()
  if (!trimmed) return fallback
  const accent = normalizeAccentHex(trimmed)
  const body = accent.replace(/^#/, '')
  if (/^[0-9A-Fa-f]{6}$/.test(body)) return `#${body}`
  return fallback
}

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
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        maxWidth: 320,
        background: 'var(--kanban-card-bg)',
        border: '1px solid var(--kanban-card-border)',
        boxShadow: 'var(--kanban-card-shadow, none)',
      }}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        Preview (same as Kanban ticket card chips)
      </Text>
      <Tag style={kanbanTagStyle({ fillHex: tagPreviewFillHex(colorHex, fallbackHex) })}>{label}</Tag>
    </div>
  )
}
