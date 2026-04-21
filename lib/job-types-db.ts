import { and, asc, eq } from 'drizzle-orm'

import { db, jobTypes } from '@/lib/db'

export async function loadActiveJobTypeTitleMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ slug: jobTypes.slug, title: jobTypes.title })
    .from(jobTypes)
    .where(eq(jobTypes.isActive, true))
    .orderBy(asc(jobTypes.sortOrder), asc(jobTypes.slug))
  return new Map(rows.map((r) => [r.slug, r.title]))
}

/** Empty or null slug = clear category. Otherwise slug must exist and be active. */
export async function assertValidJobTypeSlugOrNull(slug: string | null | undefined): Promise<void> {
  if (slug == null || slug === '') return
  const [row] = await db
    .select({ slug: jobTypes.slug })
    .from(jobTypes)
    .where(and(eq(jobTypes.slug, slug), eq(jobTypes.isActive, true)))
    .limit(1)
  if (!row) {
    throw new Error('Invalid or inactive job_type')
  }
}
