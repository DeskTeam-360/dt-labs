/**
 * Auto-send User Activation + Temporary Password emails when sync-inbox
 * creates a new customer from an inbound email.
 *
 * Temporarily disabled. Set to `true` to re-enable.
 * Manual activation email from Users menu is unaffected.
 */
export const INBOX_AUTO_USER_ACTIVATION_EMAIL_ENABLED = false

export function isInboxAutoUserActivationEmailEnabled(): boolean {
  return INBOX_AUTO_USER_ACTIVATION_EMAIL_ENABLED
}
