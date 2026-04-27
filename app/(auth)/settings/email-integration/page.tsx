import { and,eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import EmailIntegrationContent from '@/components/content/settings/EmailIntegrationContent'
import { db, emailIntegrations } from '@/lib/db'

export default async function EmailIntegrationPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const [integrationRow] = await db
    .select({
      id: emailIntegrations.id,
      provider: emailIntegrations.provider,
      emailAddress: emailIntegrations.emailAddress,
      isActive: emailIntegrations.isActive,
      expiresAt: emailIntegrations.expiresAt,
      createdAt: emailIntegrations.createdAt,
      lastSyncAt: emailIntegrations.lastSyncAt,
    })
    .from(emailIntegrations)
    .where(and(eq(emailIntegrations.provider, 'google')))
    .limit(1)

  const integration = integrationRow
    ? {
        id: integrationRow.id,
        provider: integrationRow.provider,
        email_address: integrationRow.emailAddress,
        is_active: integrationRow.isActive ?? false,
        expires_at: integrationRow.expiresAt ? new Date(integrationRow.expiresAt).toISOString() : null,
        created_at: integrationRow.createdAt ? new Date(integrationRow.createdAt).toISOString() : '',
        last_sync_at: integrationRow.lastSyncAt ? new Date(integrationRow.lastSyncAt).toISOString() : null,
      }
    : null

  return (
    <EmailIntegrationContent
      user={session.user}
      integration={integration}
    />
  )
}
