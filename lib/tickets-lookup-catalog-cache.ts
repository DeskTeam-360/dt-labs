import { asc } from 'drizzle-orm'
import { revalidateTag, unstable_cache } from 'next/cache'

import {
  companies,
  db,
  tags,
  teams,
  ticketPriorities,
  ticketStatuses,
  ticketTypes,
  users,
} from '@/lib/db'
/** Seconds; clamp 30s–24h. Default 30 min if env unset or invalid. */
const DEFAULT_TICKETS_LOOKUP_CATALOG_REVALIDATE_SEC = 30 * 60

function catalogRevalidateSeconds(): number {
  const raw = Number(process.env.TICKETS_LOOKUP_CATALOG_REVALIDATE_SECONDS)
  if (!Number.isFinite(raw) || raw < 30) return DEFAULT_TICKETS_LOOKUP_CATALOG_REVALIDATE_SEC
  return Math.min(86400, Math.floor(raw))
}

async function loadTicketsLookupCatalog() {
  const [
    teamsData,
    usersData,
    ticketTypesData,
    ticketPrioritiesData,
    companiesData,
    tagsData,
    statusesData,
  ] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(asc(teams.name)),
    db
      .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role })
      .from(users)
      .orderBy(asc(users.fullName)),
    db
      .select({ id: ticketTypes.id, title: ticketTypes.title, slug: ticketTypes.slug, color: ticketTypes.color })
      .from(ticketTypes)
      .orderBy(asc(ticketTypes.sortOrder)),
    db
      .select({
        id: ticketPriorities.id,
        title: ticketPriorities.title,
        slug: ticketPriorities.slug,
        color: ticketPriorities.color,
        sortOrder: ticketPriorities.sortOrder,
      })
      .from(ticketPriorities)
      .orderBy(asc(ticketPriorities.sortOrder)),
    db
      .select({ id: companies.id, name: companies.name, color: companies.color, email: companies.email })
      .from(companies)
      .orderBy(asc(companies.name)),
    db.select({ id: tags.id, name: tags.name, slug: tags.slug, color: tags.color }).from(tags).orderBy(asc(tags.name)),
    db
      .select({
        id: ticketStatuses.id,
        slug: ticketStatuses.slug,
        title: ticketStatuses.title,
        customerTitle: ticketStatuses.customerTitle,
        color: ticketStatuses.color,
        showInKanban: ticketStatuses.showInKanban,
        sortOrder: ticketStatuses.sortOrder,
        isActive: ticketStatuses.isActive,
      })
      .from(ticketStatuses)
      .orderBy(asc(ticketStatuses.sortOrder)),
  ])

  return {
    teams: teamsData,
    users: usersData.map((u) => ({ id: u.id, full_name: u.fullName, email: u.email, role: u.role })),
    ticketTypes: ticketTypesData,
    ticketPriorities: ticketPrioritiesData,
    companies: companiesData,
    tags: tagsData,
    statuses: statusesData.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      customer_title: s.customerTitle ?? undefined,
      color: s.color,
      /** Raw DB value; clients use isTicketStatusInKanban */
      show_in_kanban: s.showInKanban,
      sort_order: s.sortOrder,
      is_active: s.isActive,
    })),
  }
}

/**
 * Shared catalog for `/api/tickets/lookup` (teams, users, types, priorities, companies, tags, statuses).
 * Time-based revalidation lowers Postgres load; user-specific slices stay uncached in the route.
 */
export const TICKETS_LOOKUP_CATALOG_TAG = 'tickets-lookup-catalog' as const

/** Call after mutating teams, users, companies, tags, ticket types/priorities/statuses. */
export function revalidateTicketsLookupCatalog() {
  revalidateTag(TICKETS_LOOKUP_CATALOG_TAG, { expire: 0 })
}

export const getTicketsLookupCatalog = unstable_cache(loadTicketsLookupCatalog, ['tickets-lookup-catalog-v1'], {
  revalidate: catalogRevalidateSeconds(),
  tags: [TICKETS_LOOKUP_CATALOG_TAG],
})
