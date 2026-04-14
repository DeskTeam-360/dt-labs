export type UserTimeTrackerTopTicket = {
  ticket_id: number
  title: string | null
  reported_seconds_total: number
}

/** Response shape when GET /api/users/time-tracker includes include_ticket_summary=1 */
export type UserTimeTrackerTicketSummary = {
  distinct_ticket_count: number
  /** Up to 5 tickets with the most reported time in the filtered period, highest first */
  top_tickets: UserTimeTrackerTopTicket[]
}
