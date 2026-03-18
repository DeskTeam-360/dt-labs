/**
 * Send automation/email event logs to spreadsheet via Apps Script Web App.
 * Set AUTOMATION_LOG_WEBHOOK_URL in .env to enable.
 * Fire-and-forget: does not block or throw.
 */

export interface AutomationLogPayload {
  timestamp?: string
  event: string
  ticket_id?: number | string
  email?: string
  subject?: string
  message?: string
  detail?: string
  [key: string]: unknown
}

export async function sendAutomationLog(payload: AutomationLogPayload): Promise<void> {
  const url = process.env.AUTOMATION_LOG_WEBHOOK_URL
  if (!url?.trim()) return

  const secret = process.env.AUTOMATION_LOG_SECRET
  const body = {
    ...payload,
    timestamp: payload.timestamp || new Date().toISOString(),
    ...(secret && { secret }),
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn('[AutomationLog] Webhook returned', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    console.warn('[AutomationLog] Webhook failed:', err)
  }
}
