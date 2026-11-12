import { and, eq, lt } from 'drizzle-orm'

import { db, wpSiteReports, wpSites } from '@/lib/db'

const KEEP_REPORT_DAYS = 90

/**
 * Keeps a report of a site, whichever way it came (the plugin sent it, or this server asked for it): the site's latest report and
 * time are updated and the report is added to its history. Administrator email addresses are not kept: the id and login are enough
 * to spot a new administrator. Returns the updated site.
 */
export async function storeWpReport(site: typeof wpSites.$inferSelect, payload: Record<string, unknown>, signature?: string): Promise<typeof wpSites.$inferSelect> {
  const users = payload.users as { administrators?: Record<string, unknown>[] } | undefined
  if (users && Array.isArray(users.administrators)) {
    users.administrators = users.administrators.map(({ email: _email, ...rest }) => rest)
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 50) : null)
  const [updated] = await db
    .update(wpSites)
    .set({
      wpVersion: str(payload.wp_version),
      phpVersion: str(payload.php_version),
      lastReport: payload,
      lastSeenAt: new Date(),
      ...(signature ? { lastSignature: signature.slice(0, 64) } : {}),
    })
    .where(eq(wpSites.id, site.id))
    .returning()
  await db.insert(wpSiteReports).values({ siteId: site.id, payload })
  await db
    .delete(wpSiteReports)
    .where(and(eq(wpSiteReports.siteId, site.id), lt(wpSiteReports.createdAt, new Date(Date.now() - KEEP_REPORT_DAYS * 86400000))))
  return updated ?? site
}
