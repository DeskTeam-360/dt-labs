/**
 * Actions schema for automation_rules.actions JSONB.
 * Engine will apply these when conditions match.
 */
export interface AutomationActions {
  /** Assign ticket to this team (uuid) */
  team_id?: string
  /** Set priority (slug: urgent, high, medium, low) */
  priority_slug?: string
  /** Set ticket type (slug) */
  type_slug?: string
  /** Add these tags (array of tag uuids) */
  tag_ids?: string[]
  /** Set visibility: private | team | specific_users | public */
  visibility?: string
  /** Add an automatic note (comment) to the ticket */
  add_note?: string
  /** User ID to attribute the auto note to (required when add_note is set) */
  add_note_user_id?: string
  /** Add checklist items (array of titles) */
  add_checklist_items?: string[]
  /** Legacy: assign group name (maps to team by name if needed) */
  assign_group?: string
}
