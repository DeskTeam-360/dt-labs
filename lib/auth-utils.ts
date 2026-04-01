/**
 * Role-based access control helpers.
 * - Admin: full access
 * - Manager: tickets + dashboard, ticket attributes
 * - Staff: dashboard, users (no companies, teams, email, knowledge-base, tickets, ticket attributes)
 * - Customer: limited (handled separately in sidebar)
 */

export function everyOneCanAccess(role: string | undefined): boolean {
  return true
}

export function isAdmin(role: string | undefined): boolean {
  return (role ?? '').toLowerCase() === 'admin'
}

export function isManager(role: string | undefined): boolean {
  return (role ?? '').toLowerCase() === 'manager'
}

export function isAdminOrManager(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase()
  return r === 'admin' || r === 'manager'
}

/** Companies: Admin only */
export function canAccessCompanies(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Tickets: Admin & Manager */
export function canAccessTickets(role: string | undefined): boolean {
  return everyOneCanAccess(role)
}

/** Ticket Attributes menu (statuses, types, priorities, tags): Admin & Manager */
export function canAccessTicketAttributes(role: string | undefined): boolean {
  return isAdminOrManager(role)
}

/** Automation rules UI & API: Admin only */
export function canAccessAutomationRules(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Teams: Admin only */
export function canAccessTeams(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Email Integration: Admin only */
export function canAccessEmailIntegration(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Knowledge Base: Admin only */
export function canAccessKnowledgeBase(role: string | undefined): boolean {
  return isAdmin(role)
}

/** Users: Admin only */
export function canAccessUsers(role: string | undefined): boolean {
  return isAdmin(role)
}
