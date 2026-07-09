import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

import { db, emailIntegrations, messageTemplates, users } from '@/lib/db'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

function generateTemporaryPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length]
  }
  return out
}

/** POST /api/auth/forgot-password - Self-service password reset */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Always return 200 to avoid user enumeration
  const [user] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, status: users.status, deletedAt: users.deletedAt, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user || user.deletedAt || user.status !== 'active' || !user.passwordHash) {
    // Silently succeed — don't reveal whether account exists
    return NextResponse.json({ success: true })
  }

  const temporaryPassword = generateTemporaryPassword(12)
  const hash = await bcrypt.hash(temporaryPassword, 10)
  await db
    .update(users)
    .set({ passwordHash: hash, mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, user.id))

  // Send email (best-effort — don't fail the request if email fails)
  try {
    await sendResetEmail({ toEmail: user.email, temporaryPassword, recipientUserId: user.id })
  } catch (err) {
    console.error('[forgot-password] email send failed:', err)
  }

  return NextResponse.json({ success: true })
}

async function sendResetEmail(params: {
  toEmail: string
  temporaryPassword: string
  recipientUserId: string
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) return

  const [tpl] = await db
    .select({ status: messageTemplates.status, content: messageTemplates.content, emailSubject: messageTemplates.emailSubject })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'requester_notification_password_reset'))
    .limit(1)
  if (!tpl || tpl.status !== 'active') return

  const [integration] = await db
    .select({
      id: emailIntegrations.id,
      emailAddress: emailIntegrations.emailAddress,
      accessToken: emailIntegrations.accessToken,
      refreshToken: emailIntegrations.refreshToken,
      expiresAt: emailIntegrations.expiresAt,
    })
    .from(emailIntegrations)
    .where(and(eq(emailIntegrations.provider, 'google'), eq(emailIntegrations.isActive, true)))
    .limit(1)
  if (!integration?.accessToken) return

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `${baseUrl}/api/email/google/callback`)

  let accessToken = integration.accessToken
  const expiresAt = integration.expiresAt ? new Date(integration.expiresAt) : null
  const needsRefresh = !expiresAt || expiresAt <= new Date()
  if (needsRefresh && integration.refreshToken) {
    oauth2Client.setCredentials({ refresh_token: integration.refreshToken })
    const { credentials } = await oauth2Client.refreshAccessToken()
    accessToken = credentials.access_token ?? integration.accessToken
    if (credentials.access_token && credentials.expiry_date) {
      await db
        .update(emailIntegrations)
        .set({ accessToken: credentials.access_token, expiresAt: new Date(credentials.expiry_date), updatedAt: new Date() })
        .where(eq(emailIntegrations.id, integration.id))
    }
  } else {
    oauth2Client.setCredentials({ access_token: accessToken })
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const fromEmail = integration.emailAddress || 'noreply@example.com'
  const safeBase = baseUrl.replace(/\/$/, '')
  const loginUrl = `${safeBase}/login`
  const changePasswordUrl = `${safeBase}/change-password`

  const [recipientUser] = await db.select().from(users).where(eq(users.id, params.recipientUserId)).limit(1)
  const recipientMap = userRowToMergeMap(recipientUser ?? null)

  const subject = tpl.emailSubject?.trim() || 'Your DeskTeam360 password has been reset'
  const subjectMime = encodeSubjectHeader(subject)

  const rawTpl = tpl.content?.trim() ?? ''
  const fallbackHtml =
    `<p>Hi ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
    `<p>We received a request to reset your DeskTeam360 account password.</p>` +
    `<p>Your temporary password is: <strong><code>${params.temporaryPassword}</code></strong></p>` +
    `<p>Please sign in and change your password immediately: <a href="${changePasswordUrl}">${changePasswordUrl}</a></p>` +
    `<p>If you did not request this, you can safely ignore this email.</p>`

  const bodyHtml = rawTpl
    ? mergeMessageTemplateHtml(rawTpl, {
        origin: safeBase,
        ticketId: '',
        recipient: recipientMap,
        sender: recipientMap,
        extra: { temporary_password: params.temporaryPassword, login_url: loginUrl, change_password_url: changePasswordUrl },
        useDomMerge: false,
      })
    : fallbackHtml

  const rawEmail = [
    `From: ${fromEmail}`,
    `To: ${params.toEmail}`,
    `Subject: ${subjectMime}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    bodyHtml,
  ].join('\r\n')

  const raw = Buffer.from(rawEmail).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}
