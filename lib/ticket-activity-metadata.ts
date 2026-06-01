/**
 * Human-readable summary of ticket_activity_log.metadata for UI tables.
 */

const MAX_VAL_LEN = 80

function trunc(s: string): string {
  const t = s.trim()
  return t.length <= MAX_VAL_LEN ? t : t.slice(0, MAX_VAL_LEN) + '…'
}

function formatScalarLabel(v: unknown, fieldKey?: string): string {
  if (v === null || v === undefined || v === '') return 'None'
  if (fieldKey === 'status' || fieldKey === 'visibility' || fieldKey === 'ticketType') {
    const s = String(v)
    return trunc(
      s
        .split(/[_-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' '),
    )
  }
  return str(v)
}

const TICKET_FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  project_status_id: 'Project status',
  priority: 'Priority',
  teamId: 'Team',
  typeId: 'Type',
  title: 'Title',
  description: 'Description',
  shortNote: 'Short note',
  visibility: 'Visibility',
  ticketType: 'Ticket type',
  companyId: 'Company',
  contactUserId: 'Contact',
  dueDateIso: 'Due date',
  assignee_ids: 'Assignees',
  tag_ids: 'Tags',
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return trunc(v.replace(/\s+/g, ' '))
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return trunc(JSON.stringify(v))
  try {
    return trunc(JSON.stringify(v))
  } catch {
    return '…'
  }
}

/** One-line preview of stored metadata (especially ticket_updated.changes). */
export function summarizeTicketActivityMetadata(action: string, metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return ''
  const m = metadata as Record<string, unknown>

  /** Automation rows: short label only (no field-by-field diff). */
  if (m.source === 'automation_rule') {
    const title = typeof m.rule_name === 'string' ? m.rule_name.trim() : ''
    return title ? `RUN ${title}` : 'RUN'
  }

  if (action === 'ticket_updated') {
    const parts: string[] = []
    const changes = m.changes
    const entityLabels = m.entity_labels as { teams?: Record<string, string> } | undefined
    const teamNames = entityLabels?.teams

    const formatTeamRef = (id: unknown): string => {
      if (id == null || id === '') return 'None'
      const s = String(id)
      const name = teamNames?.[s]
      if (name) return trunc(name.replace(/\s+/g, ' '))
      return str(id)
    }

    if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
      for (const [key, val] of Object.entries(changes)) {
        if (val && typeof val === 'object' && 'from' in val && 'to' in val) {
          const ft = val as { from: unknown; to: unknown }
          const label = TICKET_FIELD_LABELS[key] ?? key
          if (key === 'teamId') {
            parts.push(`${label}: ${formatTeamRef(ft.from)} → ${formatTeamRef(ft.to)}`)
          } else {
            parts.push(`${label}: ${formatScalarLabel(ft.from, key)} → ${formatScalarLabel(ft.to, key)}`)
          }
        }
      }
    }
    const added = m.attachments_added
    if (Array.isArray(added) && added.length > 0) {
      const names = added
        .map((x) => (x && typeof x === 'object' && 'file_name' in x ? String((x as { file_name?: string }).file_name ?? '') : ''))
        .filter(Boolean)
      parts.push(names.length ? `+files: ${names.join(', ')}` : `+${added.length} file(s)`)
    }
    const removed = m.attachments_removed
    if (Array.isArray(removed) && removed.length > 0) {
      const names = removed
        .map((x) => (x && typeof x === 'object' && 'file_name' in x ? String((x as { file_name?: string }).file_name ?? '') : ''))
        .filter(Boolean)
      parts.push(names.length ? `−files: ${names.join(', ')}` : `−${removed.length} file(s)`)
    }
    return parts.join(' · ')
  }

  if (action === 'comment_attachment_deleted') {
    const fn = typeof m.file_name === 'string' ? m.file_name.trim() : ''
    return fn ? trunc(fn) : ''
  }

  return ''
}
