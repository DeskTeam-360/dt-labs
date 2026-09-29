/**
 * Human-readable summary of ticket_activity_log.metadata for UI tables.
 */

const MAX_VAL_LEN = 80

function trunc(s: string): string {
  const t = s.trim()
  return t.length <= MAX_VAL_LEN ? t : t.slice(0, MAX_VAL_LEN) + '…'
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

type EntityLabels = {
  teams?: Record<string, string>
  tags?: Record<string, string>
  contacts?: Record<string, string>
  assignees?: Record<string, string>
  statuses?: Record<string, string>
  project_statuses?: Record<string, string>
  companies?: Record<string, string>
}

export type TicketActivityChangeRow = {
  key: string
  label: string
  from: string
  to: string
  /** Values are rich HTML (description) and should be rendered, not shown as text. */
  isHtml: boolean
}

const REF_MAP_BY_KEY: Record<string, keyof EntityLabels> = {
  status: 'statuses',
  teamId: 'teams',
  tag_ids: 'tags',
  assignee_ids: 'assignees',
  contactUserId: 'contacts',
  project_status_id: 'project_statuses',
  companyId: 'companies',
}

function fullValue(v: unknown, key: string, labels: EntityLabels | undefined): string {
  const map = REF_MAP_BY_KEY[key] ? labels?.[REF_MAP_BY_KEY[key]] : undefined
  const one = (id: unknown): string => {
    if (id == null || id === '') return 'None'
    const name = map?.[String(id)]
    if (name) return name.replace(/\s+/g, ' ').trim()
    if (key === 'status' || key === 'visibility' || key === 'ticketType') {
      return String(id)
        .split(/[_-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    }
    if (typeof id === 'string') return key === 'description' ? id : id.replace(/\s+/g, ' ')
    if (typeof id === 'number' || typeof id === 'boolean') return String(id)
    try {
      return JSON.stringify(id)
    } catch {
      return '…'
    }
  }
  if (key === 'tag_ids' || key === 'assignee_ids') {
    return Array.isArray(v) && v.length > 0 ? v.map(one).join(', ') : 'None'
  }
  return one(v)
}

/** Full, untruncated field-by-field changes of a `ticket_updated` entry (for the details view). */
export function ticketActivityChangeRows(action: string, metadata: unknown): TicketActivityChangeRow[] {
  if (action !== 'ticket_updated' || !metadata || typeof metadata !== 'object') return []
  const m = metadata as Record<string, unknown>
  if (m.source === 'automation_rule') return []
  const changes = m.changes
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return []
  const labels = m.entity_labels as EntityLabels | undefined
  const rows: TicketActivityChangeRow[] = []
  for (const [key, val] of Object.entries(changes)) {
    if (!val || typeof val !== 'object' || !('from' in val) || !('to' in val)) continue
    const ft = val as { from: unknown; to: unknown }
    rows.push({
      key,
      label: TICKET_FIELD_LABELS[key] ?? key,
      from: fullValue(ft.from, key, labels),
      to: fullValue(ft.to, key, labels),
      isHtml: key === 'description',
    })
  }
  return rows
}

function fileNames(list: unknown): string[] | null {
  if (!Array.isArray(list) || list.length === 0) return null
  return list
    .map((x) => (x && typeof x === 'object' && 'file_name' in x ? String((x as { file_name?: string }).file_name ?? '') : ''))
    .filter(Boolean)
}

/** Attachment names added/removed in a `ticket_updated` entry. */
export function ticketActivityAttachmentChanges(metadata: unknown): { added: string[]; removed: string[]; addedCount: number; removedCount: number } {
  const m = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  const added = Array.isArray(m.attachments_added) ? m.attachments_added : []
  const removed = Array.isArray(m.attachments_removed) ? m.attachments_removed : []
  return {
    added: fileNames(added) ?? [],
    removed: fileNames(removed) ?? [],
    addedCount: added.length,
    removedCount: removed.length,
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
    const parts = ticketActivityChangeRows(action, metadata).map(
      (r) => `${r.label}: ${trunc(r.from.replace(/\s+/g, ' '))} → ${trunc(r.to.replace(/\s+/g, ' '))}`
    )
    const att = ticketActivityAttachmentChanges(metadata)
    if (att.addedCount > 0) parts.push(att.added.length ? `+files: ${att.added.join(', ')}` : `+${att.addedCount} file(s)`)
    if (att.removedCount > 0) parts.push(att.removed.length ? `−files: ${att.removed.join(', ')}` : `−${att.removedCount} file(s)`)
    return parts.join(' · ')
  }

  if (action === 'comment_attachment_deleted') {
    const fn = typeof m.file_name === 'string' ? m.file_name.trim() : ''
    return fn ? trunc(fn) : ''
  }

  return ''
}
