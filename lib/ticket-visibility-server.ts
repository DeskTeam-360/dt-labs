import { and, eq, or, type SQL, sql } from 'drizzle-orm'

import { appSettings, db, tickets, users } from '@/lib/db'
import {
  DEFAULT_TICKET_VISIBILITY_RULES,
  parseTicketVisibilityRules,
  TICKET_VISIBILITY_LEVELS,
  type TicketVisibilityRulesMap,
  userMatchesVisibilityRule,
  type VisibilityUserProfile,
} from '@/lib/ticket-visibility'

const SETTINGS_KEY = 'ticket_visibility_rules'

export async function getTicketVisibilityRules(): Promise<TicketVisibilityRulesMap> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).limit(1)
  if (!row?.value) return structuredClone(DEFAULT_TICKET_VISIBILITY_RULES)
  try {
    return parseTicketVisibilityRules(JSON.parse(row.value))
  } catch {
    return structuredClone(DEFAULT_TICKET_VISIBILITY_RULES)
  }
}

export async function setTicketVisibilityRules(rules: TicketVisibilityRulesMap): Promise<void> {
  const normalized = parseTicketVisibilityRules(rules)
  const value = JSON.stringify(normalized)
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    })
}

export async function loadVisibilityUserProfile(userId: string): Promise<VisibilityUserProfile | null> {
  const [row] = await db
    .select({
      role: users.role,
      department: users.department,
      position: users.position,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row ?? null
}

/**
 * SQL access for non-admin agents: legacy public/private/specific_users/team-membership
 * plus configured visibility levels that match the current user profile.
 */
export async function buildTicketVisibilityAccessSql(userId: string, role: string | undefined): Promise<SQL> {
  const profile = (await loadVisibilityUserProfile(userId)) ?? {
    role,
    department: null,
    position: null,
  }
  const rules = await getTicketVisibilityRules()

  const parts: SQL[] = [
    eq(tickets.visibility, 'public'),
    and(eq(tickets.visibility, 'private'), eq(tickets.createdBy, userId))!,
    sql`(${tickets.visibility} = 'specific_users' AND ${tickets.id} IN (SELECT ticket_id FROM ticket_assignees WHERE user_id = ${userId}))`,
  ]

  for (const level of TICKET_VISIBILITY_LEVELS) {
    const rule = rules[level]
    if (level === 'team' && rule.includeTeamMembers) {
      parts.push(
        sql`(${tickets.visibility} = 'team' AND ${tickets.teamId} IN (SELECT team_id FROM team_members WHERE user_id = ${userId}))`
      )
    }
    if (userMatchesVisibilityRule(profile, rule)) {
      parts.push(eq(tickets.visibility, level))
    }
  }

  return or(...parts)!
}
