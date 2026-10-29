/**
 * How loaded someone is, by their active tickets (Open, Received, Working Team):
 * from 6 on it is a warning (orange), from 10 on it is critical (red).
 */
export const LOAD_WARNING_AT = 6
export const LOAD_CRITICAL_AT = 10

export type LoadLevel = 'normal' | 'warning' | 'critical'

export function loadLevel(activeTickets: number): LoadLevel {
  if (activeTickets >= LOAD_CRITICAL_AT) return 'critical'
  if (activeTickets >= LOAD_WARNING_AT) return 'warning'
  return 'normal'
}
