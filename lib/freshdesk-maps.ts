// Freshdesk status code → our ticket status slug
export const FD_STATUS_MAP: Record<number, string> = {
  2: 'open',
  3: 'pending',
  4: 'closed',
  5: 'closed',
  8: 'received',
  9: 'question',
  10: 'working_team',
  11: 'am_review',
  12: 'client_review',
  13: 'feedback_received',
  14: 'revision',
  9000: 'open',
}

// Freshdesk ticket_type string → our ticket_types.id
export const FD_TYPE_MAP: Record<string, number> = {
  Question: 14,
  'Graphic Design Request': 5,
  'Website Request': 16,
  'Website Set Up': 15,
  HRD: 18,
  Others: 17,
}
