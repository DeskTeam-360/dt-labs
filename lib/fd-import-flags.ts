/**
 * Imports that read straight from Freshdesk (the bulk "Run Import" and the "Resync" buttons) are switched off:
 * tickets are brought in from the FD Archive, which these cannot read. Set to true to bring them back.
 */
export const FRESHDESK_LIVE_IMPORT_ENABLED = false

export const FRESHDESK_LIVE_IMPORT_OFF_MESSAGE =
  'This import from Freshdesk is switched off. Import tickets from the FD Archive instead (Tickets, Import).'
