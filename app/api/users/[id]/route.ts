import { auth } from '@/auth'
import { db, users, companies, emailIntegrations } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { randomBytes } from 'crypto'

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

async function sendCustomerResetPasswordEmail(params: {
  toEmail: string
  temporaryPassword: string
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) {
    throw new Error('Email integration not configured')
  }

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

  if (!integration?.accessToken) {
    throw new Error('Email integration not connected')
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/email/google/callback`
  )

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
        .set({
          accessToken: credentials.access_token,
          expiresAt: new Date(credentials.expiry_date),
          updatedAt: new Date(),
        })
        .where(eq(emailIntegrations.id, integration.id))
    }
  } else {
    oauth2Client.setCredentials({ access_token: accessToken })
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const fromEmail = integration.emailAddress || 'noreply@example.com'
  const safeBaseUrl = baseUrl.replace(/\/$/, '')
  const loginUrl = `${safeBaseUrl}/login`
  const changePasswordUrl = `${safeBaseUrl}/change-password`
  const subject = 'Your portal password has been reset'
  const subjectMime = encodeSubjectHeader(subject)
  const bodyHtml =
    `<p>Hello,</p>` +
    `<p>An admin has reset your portal password.</p>` +
    `<p><strong>Temporary password:</strong> <code>${params.temporaryPassword}</code></p>` +
    `<p>Please sign in at <a href="${loginUrl}">${loginUrl}</a> and change your password immediately at <a href="${changePasswordUrl}">${changePasswordUrl}</a>.</p>` +
    `<p>If you did not expect this reset, please contact your administrator right away.</p>`

  const rawEmail = [
    `From: ${fromEmail}`,
    `To: ${params.toEmail}`,
    `Subject: ${subjectMime}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    bodyHtml,
  ].join('\r\n')

  const raw = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })
}

/** GET /api/users/[id] - Get user detail */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const [row] = await db
    .select({
      user: users,
      company: companies,
    })
    .from(users)
    .leftJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.id, id))

  if (!row?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const u = row.user
  return NextResponse.json({
    id: u.id,
    email: u.email,
    first_name: u.firstName,
    last_name: u.lastName,
    full_name: u.fullName,
    role: u.role,
    status: u.status,
    company_id: u.companyId,
    company: row.company ? { id: row.company.id, name: row.company.name } : null,
    avatar_url: u.avatarUrl,
    created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
    updated_at: u.updatedAt ? new Date(u.updatedAt).toISOString() : '',
    last_login_at: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    last_active_at: u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : null,
    phone: u.phone,
    department: u.department,
    position: u.position,
    bio: u.bio,
    timezone: u.timezone,
    locale: u.locale,
    is_email_verified: u.isEmailVerified,
  })
}

/** PATCH /api/users/[id] - Update user */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const role = (session.user as { role?: string }).role?.toLowerCase()
  const isAdmin = role === 'admin'
  const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (body.send_reset_email) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if ((targetUser.role || '').toLowerCase() !== 'customer') {
      return NextResponse.json({ error: 'Reset email is only available for customer users' }, { status: 400 })
    }
    if (!targetUser.email) {
      return NextResponse.json({ error: 'Customer email is missing' }, { status: 400 })
    }
    const temporaryPassword = generateTemporaryPassword(12)
    const passwordHash = await bcrypt.hash(temporaryPassword, 10)
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, id))
    await sendCustomerResetPasswordEmail({
      toEmail: targetUser.email,
      temporaryPassword,
    })
    return NextResponse.json({ ok: true, sent: true })
  }

  const updateData: Record<string, unknown> = {}
  if (body.full_name !== undefined) updateData.fullName = body.full_name
  if (body.first_name !== undefined) updateData.firstName = body.first_name || null
  if (body.last_name !== undefined) updateData.lastName = body.last_name || null
  if (body.role !== undefined) updateData.role = body.role
  if (body.status !== undefined) updateData.status = body.status
  if (body.company_id !== undefined) updateData.companyId = body.company_id || null
  if (body.avatar_url !== undefined) updateData.avatarUrl = body.avatar_url
  if (body.phone !== undefined) updateData.phone = body.phone || null
  if (body.department !== undefined) updateData.department = body.department || null
  if (body.position !== undefined) updateData.position = body.position || null
  if (body.bio !== undefined) updateData.bio = body.bio || null
  if (body.timezone !== undefined) updateData.timezone = body.timezone || 'UTC'
  if (body.locale !== undefined) updateData.locale = body.locale || 'en'
  if (body.is_email_verified !== undefined) updateData.isEmailVerified = body.is_email_verified

  // Admin can change any user's password
  if (isAdmin && body.password) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    updateData.passwordHash = await bcrypt.hash(body.password, 10)
  }

  await db.update(users).set({ ...updateData, updatedAt: new Date() }).where(eq(users.id, id))

  return NextResponse.json({ ok: true })
}

/** DELETE /api/users/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await db.delete(users).where(eq(users.id, id))

  return NextResponse.json({ ok: true })
}
