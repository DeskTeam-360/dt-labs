import type { CSSProperties } from 'react'

/** Matches ticket Kanban chips (Settings → Tags preview shares this recipe). */
export const KANBAN_SEMANTIC_GREEN = '#52c41a'
export const KANBAN_SEMANTIC_BLUE = '#1677ff'

/** Tint behind accent text+border — keep in sync between Kanban cards and settings preview. */
export const KANBAN_ACCENT_BG_OPACITY = 0.1

export function normalizeAccentHex(hex: string): string {
  const t = hex.trim().replace(/^#/, '')
  if (/^[0-9A-Fa-f]{3}$/.test(t)) {
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`
  }
  if (/^[0-9A-Fa-f]{6}$/.test(t)) {
    return `#${t}`
  }
  return hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`
}

/** Accent tint: hue from hex, blended with transparency so the card surface shows through. */
export function hexAccentToRgba(accentHex: string, alpha: number): string {
  const h = accentHex.replace(/^#/, '')
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return 'transparent'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const KANBAN_TAG_BASE: CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: '18px',
  paddingInline: 8,
  paddingBlock: 2,
  borderRadius: 9999,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--kanban-chip-border)',
}

export type KanbanTicketChipStyleOpts = {
  /** Accent pill: border + label = hue; bg = hsla-ish via `hexAccentToRgba(..., KANBAN_ACCENT_BG_OPACITY)` */
  fillHex?: string
  neutral?: boolean
  cursor?: CSSProperties['cursor']
} & Omit<CSSProperties, 'cursor'>

/** Shared Kanban `<Tag>` look (Ant `color` prop unused — avoids mixed padding/border). */
export function kanbanTagStyle(opts: KanbanTicketChipStyleOpts = {}): CSSProperties {
  const { fillHex, neutral, cursor, ...extra } = opts
  let out: CSSProperties = { ...KANBAN_TAG_BASE, ...extra }
  if (fillHex) {
    const accent = normalizeAccentHex(fillHex)
    out = {
      ...out,
      backgroundColor: hexAccentToRgba(accent, KANBAN_ACCENT_BG_OPACITY),
      borderColor: accent,
      color: accent,
      fontWeight: 500,
      borderWidth: 1,
    }
  } else if (neutral) {
    out = {
      ...out,
      backgroundColor: 'var(--ticket-row-chip-neutral-bg)',
      color: 'var(--ticket-row-chip-neutral-fg)',
      borderColor: 'var(--kanban-chip-border)',
    }
  }
  if (cursor != null) out.cursor = cursor
  return out
}
