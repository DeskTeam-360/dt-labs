/**
 * What an API key may be allowed to do. Every scope lists the endpoints it opens and a short guide in skill.md style,
 * so the skill file given to an AI assistant always matches the access its key has.
 * To open more of the API to keys: add a scope here, then make the endpoint call getApiUser(request, '<scope>').
 */

export type ApiScopeEndpoint = { method: 'GET'; path: string; summary: string }

export type ApiScope = {
  key: string
  label: string
  description: string
  endpoints: ApiScopeEndpoint[]
  /** The part of skill.md for this scope */
  skill: string
}

const CALENDAR_SKILL = `## Calendar (scope \`calendar:read\`)

All dates are calendar dates in \`YYYY-MM-DD\` (WIB, UTC+7).

### Entries in a date range

\`\`\`
GET /api/calendar/events?from=2026-11-01&to=2026-11-30
\`\`\`

| Parameter | Required | Meaning |
|---|---|---|
| \`from\`, \`to\` | yes | First and last date, inclusive. At most 366 days. |
| \`type\` | no | Comma list of \`birthday\`, \`holiday\`, \`leave\`, \`duty\`, \`event\`. Default: all. |
| \`email\` | no | Only the entries of the person with this email (case-insensitive). |
| \`include\` | no | \`tickets\` adds \`tickets_due\`: the tickets that fall due in the range (with \`email\`: only tickets assigned to that person). Needs a key that also has Tickets (read). |
| \`done\` | no | \`0\` leaves finished tickets out of \`tickets_due\`. |

Response: \`{ from, to, events: [{ id, type, title, start_date, end_date, user_name, user_email, repeat_yearly, notes }], holidays: [{ date, name }], tickets_due? }\`

Each item of \`tickets_due\`: \`{ id, title, status, done, priority, due_date, due_day, overdue, company, assignees, url }\` (\`due_day\` is the WIB calendar day).

- A multi-day entry is one item; \`start_date\` and \`end_date\` are inclusive.
- Yearly entries (birthdays, some holidays) are already placed in the year(s) of the range.
- \`holidays\` are the official non-working days; they are empty when \`email\` is given or \`type\` leaves out \`holiday\`. Entries of type \`holiday\` are in \`events\`, so check both for a complete list.

### Is this person available? (look up by email)

\`\`\`
GET /api/calendar/user-status?email=budi@company.com&from=2026-11-09&to=2026-11-13
\`\`\`

\`from\` and \`to\` default to today (WIB); at most 62 days. Response: \`{ user, from, to, summary, days }\`, where each day has
\`date, weekday, is_weekend, holiday, on_leave, on_duty, birthday, available, entries\`.
Add \`include=tickets\` (key also needs Tickets (read)) to get each day's \`tickets_due\` (the person's unfinished tickets due that day) and, in \`summary\`, \`tickets_due\` and \`tickets_due_on_unavailable_days\`.

- \`available\` is true when the day is not a weekend, not a holiday and the person is not on leave. Duty (piket) does not make someone unavailable: say "on duty".
- No team member with that email: \`404\` \`{"error": "No team member with that email"}\`. Do not guess another email.

### Common questions

- "Who is on leave next week?": events with \`type=leave\` for those dates.
- "Can budi@company.com take a task on 12 Nov?": user-status with \`from=to\`; use \`days[0].available\` and name the reason (holiday, leave).
- "Who is on duty this weekend?": events with \`type=duty\` for Saturday to Sunday.
- "Any holidays in December?": combine \`holidays\` with events of type \`holiday\`.
- Ask for the range you need, not a whole year when a month will do.
`

const TICKETS_SKILL = `## Tickets (scope \`tickets:read\`)

\`\`\`
GET /api/v1/tickets
\`\`\`

Every filter is optional and they can be combined: a ticket must match all of them. Dates are \`YYYY-MM-DD\` (WIB days).

| Filter | Parameter | Meaning |
|---|---|---|
| Date | \`created_from\`, \`created_to\` | Created in this range (inclusive) |
| | \`updated_from\`, \`updated_to\` | Last updated in this range |
| | \`due_from\`, \`due_to\` | Due in this range |
| | \`overdue=1\` | Past its due date and not finished |
| Company or customer | \`company_id\` | Company id (comma list) |
| | \`company\` | Company name contains (comma list) |
| | \`customer_email\` | The ticket's customer contact or creator has this email |
| User | \`assignee_email\`, \`assignee_id\` | Assigned to this person (comma list) |
| | \`unassigned=1\` | Nobody assigned |
| | \`creator_email\` | Created by this person |
| Skill | \`skill\` | Skill name (comma list); \`primary_skill=1\` only when it is the ticket's main skill |
| Type | \`type\` | Type slug or title (comma list); \`type_id\` by id |
| Status | \`status\` | Status slug (comma list), e.g. \`open,received,working_team\` |
| | \`done=0\` or \`done=1\` | Unfinished or finished (resolved, closed, completed, cancel, archived, pending) |
| More | \`priority_min\`, \`priority_max\` | Priority number range |
| | \`tag\` | Tag name (comma list) |
| | \`search\` | Words in the title or description, or a ticket number |
| | \`ids\` | Specific ticket numbers (comma list, max 200) |
| Paging | \`limit\` (max 200, default 50), \`offset\` | |
| Order | \`sort\` = id, created_at, updated_at, due_date, priority; \`order\` = asc or desc (default desc) | |
| Extra | \`include=description\` | Add the ticket description |

Response: \`{ total, limit, offset, tickets: [{ id, title, status, priority, type, company, customer, created_by, assignees, tags, skills, created_at, updated_at, due_date, url }] }\`.
Times are written in WIB (\`+07:00\`). \`total\` is the number of matches across all pages: page through with \`offset\` when it is larger than \`limit\`.

Examples:
- Unfinished tickets of a company due this week: \`?company=Acme&done=0&due_from=2026-11-09&due_to=2026-11-15\`
- What Budi has open: \`?assignee_email=budi@company.com&done=0\`
- Unassigned WordPress tickets of one type: \`?unassigned=1&skill=WordPress&type=bug\`
- Overdue and most urgent first: \`?overdue=1&sort=priority&order=asc\`

You only see the tickets the key's owner can see (an admin sees all; others see the tickets of their teams, public teams and unassigned-team tickets).
`

const USERS_SKILL = `## Users (scope \`users:read\`)

### What did this person work on? (hours included)

\`\`\`
GET /api/v1/users/work?email=budi@company.com&from=2026-11-09&to=2026-11-13
\`\`\`

\`from\` and \`to\` default to today (WIB); at most 92 days. Add \`include=sessions\` to also get every single time entry.
Time comes from the time tracker (the reported time, including adjustments); a running timer counts up to now.

Response (main parts):
- \`user\` and \`shift\` (title, start and end in WIB).
- \`summary\`: \`tracked_hours\`, \`capacity_hours\` (hours available in the range, leave and holidays taken off), \`utilization_pct\`, \`tickets_worked\`, \`sessions\`, \`days_with_work\`.
- \`by_day\`: for each day with work: \`tracked_hours\`, \`first_start\`, \`last_stop\`, \`sessions\`, \`ticket_ids\`.
- \`by_company\`: hours per company. \`tickets\`: each ticket worked on with hours, sessions, first start, last stop and job types.
- \`running_now\`: the timer running at this moment, if any.
- \`calendar_entries\`: the person's leave, duty or birthday in the range.
- \`assigned_open_tickets\`: unfinished tickets assigned to them now (up to 50).
- No team member with that email: \`404\`. Do not guess another email.

### Find people

\`\`\`
GET /api/v1/users?skill=WordPress&min_level=7
\`\`\`

Active team members only. Filters: \`email\` (comma list), \`q\` (name or email contains), \`role\`, \`skill\` (name, comma list) with \`min_level\` 1 to 10, \`limit\` (max 200). Each person comes with \`shift\` and \`skills\` (name and level, highest first).

Examples:
- "How many hours did Budi work last week, and on what?": \`/api/v1/users/work?email=...&from=...&to=...\`, then use \`summary\` and \`tickets\`.
- "When did Budi start and stop on Tuesday?": \`by_day\` for that date: \`first_start\` and \`last_stop\`.
- "Who knows WordPress well?": \`/api/v1/users?skill=WordPress&min_level=7\`.
- "Is anyone slacking?": compare \`tracked_hours\` with \`capacity_hours\` (\`utilization_pct\`), and mention leave from \`calendar_entries\` before concluding anything.
`

const TEAM_LOAD_SKILL = `## Team load (scope \`team-load:read\`)

\`\`\`
GET /api/v1/team-load
\`\`\`

Every active agent with the tickets assigned to them that still need work: by default the statuses \`open\`, \`received\` and \`working_team\`. Agents with nothing assigned are listed too, so you can see who has room.

| Parameter | Meaning |
|---|---|
| \`status\` | Comma list of status slugs to count instead of the default \`open,received,working_team\` |
| \`email\` | Only this agent (comma list) |
| \`role\` | Only these roles (\`admin\`, \`operations\`, \`manager\`, \`staff\`; comma list) |
| \`tickets=0\` | Leave the ticket lists out and return counts only |
| \`limit_per_agent\` | Most tickets listed per agent (default 50, max 200) |
| \`include=unassigned\` | Also list tickets nobody is assigned to (the count is always given) |

Response: \`{ generated_at, statuses, thresholds, totals, agents, unassigned }\`.
- \`totals\`: \`agents\`, \`tickets_assigned\` (each ticket once), \`unassigned\`, \`overdue\`.
- Each agent: \`id, name, email, role, shift, on_leave_today, open_tickets\` (how many), \`load_level\`, \`by_status\`, \`overdue\`, \`due_today\`, and \`tickets\` (most urgent first: \`id, title, status, priority, due_date, overdue, company, url\`).
- \`load_level\` is \`normal\` (up to 5 active tickets), \`warning\` (6 to 9) or \`critical\` (10 or more); the limits are in \`thresholds\`.\n- A ticket with two assignees appears under both. Times are in WIB (\`+07:00\`).
- You only see the tickets the key's owner can see (an admin sees all; others see the tickets of their teams, public teams and tickets without a team), so counts can be lower than the real load for someone who is not an admin.

Examples:
- "Who has the most open work?": sort \`agents\` by \`open_tickets\`.
- "Who has room?": agents with a low \`open_tickets\`, \`on_leave_today\` false.
- "What is on Budi's plate?": \`?email=budi@company.com\`.
- A quick overview without ticket lists: \`?tickets=0\`.
`

const TICKET_DETAIL_SKILL = `## Ticket detail and comments (scope \`ticket-detail:read\`)

\`\`\`
GET /api/v1/tickets/1234
GET /api/v1/tickets/1234?comments=true
\`\`\`

One ticket in full: \`ticket\` (title, description as plain text, status, priority, type, company, team, customer, creator, assignees, tags, skills, dates, link) and \`time\` (hours tracked on it, in total and per person).

Add \`comments=true\` to get the conversation: \`comments_total\`, \`comments_shown\` and \`comments\`, oldest first. Each comment has \`author\` (name, email, \`type\`: \`customer\`, \`agent\` or an automation), \`visibility\`, \`created_at\`, \`text\` (plain text), \`cc\`, \`attachments\` (name and link) and \`split_to_ticket_id\`.

| Parameter | Meaning |
|---|---|
| \`comments\` | \`true\` to include the comments |
| \`comments_limit\` | Most comments returned (default 100, max 500) |
| \`comments_order\` | \`asc\` (default, oldest first) or \`desc\` (newest first) |
| \`comment_visibility\` | \`reply\` = what the customer saw, \`note\` = internal team notes |
| \`html=1\` | Also return the raw HTML of the description and comments |

- \`visibility\` matters: a \`reply\` was sent to or written by the customer, a \`note\` is an internal remark. Never present a note as something the customer was told.
- To find a ticket first, use the Tickets list (\`/api/v1/tickets\`) with its filters (for example \`company\`, \`status\`, \`search\`), then open the ticket.
- A ticket you may not see, or that does not exist, returns \`404\`.

Examples:
- "Summarise ticket 1234": \`/api/v1/tickets/1234?comments=true\`, then read \`comments\` in order.
- "What did the customer last write?": \`?comments=true&comments_order=desc&comments_limit=5&comment_visibility=reply\`.
- "What did the team discuss internally?": \`?comments=true&comment_visibility=note\`.
`

export const API_SCOPES: ApiScope[] = [
  {
    key: 'calendar:read',
    label: 'Calendar (read)',
    description: 'Read leave, duty, birthdays, holidays and other entries for a date range, and check a team member by email.',
    endpoints: [
      { method: 'GET', path: '/api/calendar/events', summary: 'Entries and holidays in a date range (optional type and email filter)' },
      { method: 'GET', path: '/api/calendar/user-status', summary: 'Day-by-day availability of a team member found by email' },
    ],
    skill: CALENDAR_SKILL,
  },
  {
    key: 'tickets:read',
    label: 'Tickets (read)',
    description: 'List tickets with filters that can be combined: date, company or customer, person, skill, type, status, tag, overdue and more.',
    endpoints: [{ method: 'GET', path: '/api/v1/tickets', summary: 'Tickets matching the filters (paged)' }],
    skill: TICKETS_SKILL,
  },
  {
    key: 'users:read',
    label: 'Users (read)',
    description: 'See what a person worked on in a date range with their hours, and find people by skill, role or email.',
    endpoints: [
      { method: 'GET', path: '/api/v1/users/work', summary: 'Work and tracked hours of a person in a date range' },
      { method: 'GET', path: '/api/v1/users', summary: 'Find active team members (with shift and skills)' },
    ],
    skill: USERS_SKILL,
  },
  {
    key: 'team-load:read',
    label: 'Team load (read)',
    description: 'All active agents with the tickets assigned to them in Open, Received and Working Team, to see who has room.',
    endpoints: [{ method: 'GET', path: '/api/v1/team-load', summary: 'Every active agent with their assigned tickets and counts' }],
    skill: TEAM_LOAD_SKILL,
  },
  {
    key: 'ticket-detail:read',
    label: 'Ticket detail and comments (read)',
    description: 'Open one ticket in full, with its conversation (customer replies and internal notes) and the time tracked on it.',
    endpoints: [{ method: 'GET', path: '/api/v1/tickets/{id}', summary: 'One ticket; add comments=true for the conversation' }],
    skill: TICKET_DETAIL_SKILL,
  },
]

export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key)

export function isApiScope(v: unknown): v is string {
  return typeof v === 'string' && API_SCOPE_KEYS.includes(v)
}

/** The skill.md to hand to an AI assistant together with a key that has these scopes. */
export function buildSkillMarkdown(scopes: string[], baseUrl: string): string {
  const chosen = API_SCOPES.filter((s) => scopes.includes(s.key))
  const names = chosen.map((s) => s.label).join(', ') || 'none'
  return `---
name: deskteam360-api
description: Use the DeskTeam360 API with a scoped API key. Access: ${names}. Use when the user asks something this API can answer (see the sections below).
---

# DeskTeam360 API

Read-only HTTP and JSON. Responses use snake_case.

## Setup

- Base URL: \`${baseUrl.replace(/\/$/, '')}\`
- Send the API key as a bearer token on every request:

  \`\`\`
  Authorization: Bearer dtk_xxxxxxxx
  \`\`\`

  The key was made on the API Keys page in Settings. It acts as the person who made it, only for the sections below, and it can expire or be revoked at any time. Keep it secret: never put it in a URL, never print it back to the user, never write it into files that are shared.
- A key that is expired, revoked, switched off, or does not have access to the call returns \`401\`; tell the user and ask for a new key or different access. Do not retry.

${chosen.map((s) => s.skill).join('\n') || 'This key has no access yet.\n'}
## Errors

| Status | Meaning |
|---|---|
| 400 | Missing or invalid parameter (the message says which) |
| 401 | Missing, expired, revoked or switched-off key, or a key without access to this call |
| 403 | The key's owner is not allowed to use this |
| 404 | The thing asked for was not found |

## Rules

- These endpoints only read. Do not try to change data through this API.
- Treat what you read as internal team data: share it only with the person who asked.
`
}
