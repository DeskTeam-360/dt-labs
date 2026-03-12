export interface TicketsContentProps {
  user: { id: string }
}

/** Format ticket ID for display, e.g. 900 → "#900" */
export function formatTicketId(id: number): string {
  return `#${id}`
}

export interface TicketRecord {
  id: number
  title: string
  description: string | null
  short_note: string | null
  created_by: string
  due_date: string | null
  status: 'to_do' | 'in_progress' | 'completed' | 'cancel' | 'archived'
  visibility: 'private' | 'team' | 'specific_users' | 'public'
  team_id: string | null
  type_id: number | null
  priority_id: number | null
  company_id: string | null
  created_at: string
  updated_at: string
  created_via?: string
  creator_name?: string
  by_label?: string
  team_name?: string
  type?: { id: number; title: string; slug: string; color: string } | null
  priority?: { id: number; title: string; slug: string; color: string } | null
  company?: { id: string; name: string; color?: string; email?: string | null } | null
  tags?: Array<{ id: string; name: string; slug: string; color?: string }>
  assignees?: Array<{ id: string; user_id: string; user_name?: string }>
  checklist_items?: Array<unknown>
  checklist_completed?: number
  checklist_total?: number
  last_read_at?: string | null
  has_unread_replies?: boolean
}

export interface Team {
  id: string
  name: string
}

export interface UserRecord {
  id: string
  full_name: string | null
  email: string
}

export interface TicketStatusRecord {
  id: number
  slug: string
  title: string
  customer_title?: string
  color: string
  show_in_kanban: boolean
  sort_order: number
}

export interface StatusColumn {
  id: string
  title: string
  color: string
}

export interface TicketAttachment {
  id: string
  file_url: string
  file_name: string
  file_path: string
}

export interface NewTicketAttachment {
  url: string
  file_name: string
  file_path: string
}

export const DEFAULT_KANBAN_COLUMNS: StatusColumn[] = [
  { id: 'to_do', title: 'To Do', color: '#faad14' },
  { id: 'in_progress', title: 'In Progress', color: '#1890ff' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
]

export const DEFAULT_ALL_STATUSES = [
  { slug: 'to_do', title: 'To Do' },
  { slug: 'in_progress', title: 'In Progress' },
  { slug: 'completed', title: 'Completed' },
  { slug: 'cancel', title: 'Cancel' },
  { slug: 'archived', title: 'Archived' },
]

export const DEFAULT_ALL_STATUS_COLUMNS: StatusColumn[] = [
  { id: 'to_do', title: 'To Do', color: '#faad14' },
  { id: 'in_progress', title: 'In Progress', color: '#1890ff' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
  { id: 'cancel', title: 'Cancel', color: '#8c8c8c' },
  { id: 'archived', title: 'Archived', color: '#595959' },
]

/** Darken a hex color by mixing with black (0-100, e.g. 30 = 30% darker) */
export function darkenColor(hex: string, percent: number = 30): string {
  if (!hex || !/^#?[0-9A-Fa-f]{3,6}$/.test(hex)) return hex
  hex = hex.replace(/^#/, '')
  if (hex.length !== 6 && hex.length !== 3) return hex
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  const r = Math.max(0, Math.round(parseInt(hex.slice(0, 2), 16) * (1 - percent / 100)))
  const g = Math.max(0, Math.round(parseInt(hex.slice(2, 4), 16) * (1 - percent / 100)))
  const b = Math.max(0, Math.round(parseInt(hex.slice(4, 6), 16) * (1 - percent / 100)))
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function getVisibilityColor(visibility: string): string {
  switch (visibility) {
  case 'public':
    return 'green'
  case 'private':
      return 'default'
    case 'team':
      return 'blue'
    case 'specific_users':
      return 'lime'
    default:
      return 'default'
  }
}
