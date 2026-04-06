/** Row classification separate from `ticket_types` / `type_id` (bug, feature, etc.). */
export const TICKET_TYPE_VALUES = ['support', 'spam', 'trash'] as const
export type TicketTypeValue = (typeof TICKET_TYPE_VALUES)[number]

export const DEFAULT_TICKET_TYPE: TicketTypeValue = 'support'

export function parseTicketType(raw: unknown): TicketTypeValue | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  return (TICKET_TYPE_VALUES as readonly string[]).includes(s) ? (s as TicketTypeValue) : null
}

export function coerceTicketType(raw: string | null | undefined): TicketTypeValue {
  return parseTicketType(raw ?? '') ?? DEFAULT_TICKET_TYPE
}
