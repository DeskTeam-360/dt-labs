/** Roles that can be assigned to Knowledge Base articles (subset of app user roles). */
export const KNOWLEDGE_BASE_ARTICLE_ROLES = ['admin', 'manager', 'staff', 'customer'] as const
export type KnowledgeBaseArticleRole = (typeof KNOWLEDGE_BASE_ARTICLE_ROLES)[number]

const ALLOWED = new Set<string>(KNOWLEDGE_BASE_ARTICLE_ROLES)

/** Persisted value: null or [] treated as “visible to all roles” when reading. */
export function normalizeTargetRolesInput(raw: unknown): string[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const out = [
    ...new Set(
      raw
        .map((x) => String(x).toLowerCase().trim())
        .filter((x) => ALLOWED.has(x))
    ),
  ]
  return out.length === 0 ? null : out
}

export function articleVisibleForRole(
  targetRoles: string[] | null | undefined,
  userRole: string | undefined
): boolean {
  const r = (userRole ?? '').toLowerCase().trim()
  if (!targetRoles || targetRoles.length === 0) return true
  return targetRoles.some((x) => (x ?? '').toLowerCase().trim() === r)
}

export function labelForKnowledgeBaseRoles(targetRoles: string[] | null | undefined): string {
  if (!targetRoles || targetRoles.length === 0) return 'All roles'
  return targetRoles.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(', ')
}
