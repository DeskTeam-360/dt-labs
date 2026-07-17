import { USER_DEPARTMENTS, USER_POSITIONS } from '@/lib/user-work-dropdowns'

/** Visibility levels for recurring tickets (and tickets created from them). */
export const TICKET_VISIBILITY_LEVELS = [
  'team',
  'account_manager',
  'team_leader',
  'admin',
  'project_manager',
] as const

export type TicketVisibilityLevel = (typeof TICKET_VISIBILITY_LEVELS)[number]

/** Legacy ticket visibility values still supported in the tickets table. */
export const LEGACY_TICKET_VISIBILITY = ['public', 'private', 'specific_users'] as const

export const TICKET_VISIBILITY_OPTIONS: ReadonlyArray<{ value: TicketVisibilityLevel; label: string }> = [
  { value: 'team', label: 'Team' },
  { value: 'account_manager', label: 'Account Manager' },
  { value: 'team_leader', label: 'Team Leader' },
  { value: 'admin', label: 'Admin' },
  { value: 'project_manager', label: 'Project Manager' },
]

export const TICKET_VISIBILITY_ROLES = ['admin', 'manager', 'staff', 'customer'] as const

export type VisibilityAudienceRule = {
  /** Match users with any of these roles (lowercase). */
  roles: string[]
  /** Match users in any of these departments (exact DB strings). */
  departments: string[]
  /** Match users with any of these positions (exact DB strings). */
  positions: string[]
  /** When true, members of the ticket's team also see it (used by `team`). */
  includeTeamMembers: boolean
  /**
   * When true, any user whose role is not in `excludeRoles` matches
   * (used by `team_leader`: everyone except staff & customer).
   */
  matchAllExceptExcluded: boolean
  /** Roles excluded when `matchAllExceptExcluded` is true. */
  excludeRoles: string[]
}

export type TicketVisibilityRulesMap = Record<TicketVisibilityLevel, VisibilityAudienceRule>

export const DEFAULT_TICKET_VISIBILITY_RULES: TicketVisibilityRulesMap = {
  team: {
    roles: ['customer'],
    departments: [],
    positions: [],
    includeTeamMembers: true,
    matchAllExceptExcluded: false,
    excludeRoles: [],
  },
  account_manager: {
    roles: [],
    departments: ['Account Manager'],
    positions: ['CEO'],
    includeTeamMembers: false,
    matchAllExceptExcluded: false,
    excludeRoles: [],
  },
  team_leader: {
    roles: [],
    departments: [],
    positions: [],
    includeTeamMembers: false,
    matchAllExceptExcluded: true,
    excludeRoles: ['staff', 'customer'],
  },
  admin: {
    roles: [],
    departments: [],
    positions: ['HR', 'CEO', 'Project Director'],
    includeTeamMembers: false,
    matchAllExceptExcluded: false,
    excludeRoles: [],
  },
  project_manager: {
    roles: [],
    departments: ['Account Manager'],
    positions: ['HR', 'Project Manager', 'CEO'],
    includeTeamMembers: false,
    matchAllExceptExcluded: false,
    excludeRoles: [],
  },
}

export const DEFAULT_RECURRING_VISIBILITY: TicketVisibilityLevel = 'team'

export function isTicketVisibilityLevel(value: unknown): value is TicketVisibilityLevel {
  return typeof value === 'string' && (TICKET_VISIBILITY_LEVELS as readonly string[]).includes(value)
}

export function visibilityLevelLabel(value: string): string {
  return TICKET_VISIBILITY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function normalizeRule(
  raw: Partial<VisibilityAudienceRule> | undefined,
  fallback: VisibilityAudienceRule
): VisibilityAudienceRule {
  return {
    roles: Array.isArray(raw?.roles) ? raw!.roles.map(String) : [...fallback.roles],
    departments: Array.isArray(raw?.departments) ? raw!.departments.map(String) : [...fallback.departments],
    positions: Array.isArray(raw?.positions) ? raw!.positions.map(String) : [...fallback.positions],
    includeTeamMembers: typeof raw?.includeTeamMembers === 'boolean' ? raw.includeTeamMembers : fallback.includeTeamMembers,
    matchAllExceptExcluded:
      typeof raw?.matchAllExceptExcluded === 'boolean' ? raw.matchAllExceptExcluded : fallback.matchAllExceptExcluded,
    excludeRoles: Array.isArray(raw?.excludeRoles) ? raw!.excludeRoles.map(String) : [...fallback.excludeRoles],
  }
}

export function parseTicketVisibilityRules(raw: unknown): TicketVisibilityRulesMap {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<TicketVisibilityLevel, Partial<VisibilityAudienceRule>>
  >
  const result = {} as TicketVisibilityRulesMap
  for (const level of TICKET_VISIBILITY_LEVELS) {
    result[level] = normalizeRule(obj[level], DEFAULT_TICKET_VISIBILITY_RULES[level])
  }
  return result
}

export type VisibilityUserProfile = {
  role: string | null | undefined
  department: string | null | undefined
  position: string | null | undefined
}

/** Whether a user profile matches a visibility audience rule (not including team-membership). */
export function userMatchesVisibilityRule(user: VisibilityUserProfile, rule: VisibilityAudienceRule): boolean {
  const role = (user.role ?? '').toLowerCase()
  const exclude = (rule?.excludeRoles ?? []).map((r) => r.toLowerCase())
  const roles = rule?.roles ?? []
  const departments = rule?.departments ?? []
  const positions = rule?.positions ?? []

  if (rule?.matchAllExceptExcluded) {
    if (!role) return false
    return !exclude.includes(role)
  }

  if (exclude.includes(role)) return false

  if (roles.some((r) => r.toLowerCase() === role)) return true
  if (user.department && departments.includes(user.department)) return true
  if (user.position && positions.includes(user.position)) return true
  return false
}

/** Human-readable summary for settings UI. */
export function describeVisibilityRule(_level: TicketVisibilityLevel, rule: VisibilityAudienceRule): string {
  const bits: string[] = []
  const roles = rule?.roles ?? []
  const departments = rule?.departments ?? []
  const positions = rule?.positions ?? []
  const excludeRoles = rule?.excludeRoles ?? []

  if (rule?.includeTeamMembers) bits.push('ticket team members')
  if (rule?.matchAllExceptExcluded) {
    const excluded = excludeRoles.length ? excludeRoles.join(', ') : 'none'
    bits.push(`everyone except roles: ${excluded}`)
  } else {
    if (roles.length) bits.push(`roles: ${roles.join(', ')}`)
    if (departments.length) bits.push(`departments: ${departments.join(', ')}`)
    if (positions.length) bits.push(`positions: ${positions.join(', ')}`)
  }
  if (!bits.length) return 'No audience configured'
  return bits.join(' · ')
}

export const VISIBILITY_SETTINGS_DEPARTMENTS = [...USER_DEPARTMENTS]
export const VISIBILITY_SETTINGS_POSITIONS = [...USER_POSITIONS]
