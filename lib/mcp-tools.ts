/**
 * The tools of the DeskTeam360 MCP server (app/api/mcp/route.ts). Each tool is one call to the API under /api/v1 (or the calendar),
 * made with the caller's own key, so the key's access, its hourly limit and the usage log all apply exactly as for any other API call.
 * A tool is only offered to a key that has its scope (see lib/api-scopes.ts).
 */

type Prop = { type: 'string' | 'integer' | 'boolean' | 'array'; description: string; items?: { type: 'string' } }

export type McpTool = {
  name: string
  description: string
  scope: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  /** Names of the properties that fill `{id}`-style parts of the path; they are not sent as query or body. */
  pathParams?: string[]
  props: Record<string, Prop>
  required?: string[]
}

const str = (description: string): Prop => ({ type: 'string', description })
const int = (description: string): Prop => ({ type: 'integer', description })
const bool = (description: string): Prop => ({ type: 'boolean', description })
const list = (description: string): Prop => ({ type: 'array', items: { type: 'string' }, description })

const paging = { limit: int('Most results (default and maximum depend on the call)'), offset: int('Skip this many results (paging)') }
const via = str('Your name as the AI assistant, for example "Claude" or "ChatGPT". Left out, the name of this client is used. It is shown on everything you change.')
const ticketId = int('The ticket number, for example 1234')

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_tickets',
    description:
      'Find tickets. Every filter is optional and they combine (a ticket must match all). Dates are YYYY-MM-DD (WIB). Returns total, paging info and the tickets. Use get_catalog for valid status, type, tag and skill names, and list_companies for company ids.',
    scope: 'tickets:read',
    method: 'GET',
    path: '/api/v1/tickets',
    props: {
      search: str('Words in the title or description, or a ticket number'),
      status: str('Status slug(s), comma separated, for example open,received,working_team'),
      done: str('0 = unfinished only, 1 = finished only'),
      overdue: str('1 = past the due date and not finished'),
      unassigned: str('1 = nobody assigned'),
      assignee_email: str('Assigned to this person (email, comma separated)'),
      creator_email: str('Created by this person'),
      customer_email: str('The ticket customer has this email'),
      company_id: str('Company id(s), comma separated'),
      company: str('Company name contains'),
      type: str('Ticket type slug or title'),
      skill: str('Skill name(s), comma separated'),
      tag: str('Tag name(s), comma separated'),
      priority_min: int('Lowest priority number'),
      priority_max: int('Highest priority number'),
      created_from: str('Created from (YYYY-MM-DD)'),
      created_to: str('Created until (YYYY-MM-DD)'),
      updated_from: str('Updated from (YYYY-MM-DD)'),
      updated_to: str('Updated until (YYYY-MM-DD)'),
      due_from: str('Due from (YYYY-MM-DD)'),
      due_to: str('Due until (YYYY-MM-DD)'),
      ids: str('Specific ticket numbers, comma separated (max 200)'),
      sort: str('id, created_at, updated_at, due_date or priority'),
      order: str('asc or desc (default desc)'),
      include: str('description = also return the description'),
      ...paging,
    },
  },
  {
    name: 'get_catalog',
    description: 'The names the API accepts: ticket statuses (with which count as finished), ticket types, teams, tags and skills. Look here instead of guessing a status slug, tag or skill.',
    scope: 'tickets:read',
    method: 'GET',
    path: '/api/v1/catalog',
    props: { include: str('Only some parts: statuses, types, teams, tags, skills (comma separated)') },
  },
  {
    name: 'get_ticket',
    description: 'One ticket in full: description, status, priority, company, customer, assignees, tags, skills, dates and hours tracked. Set comments to true to also get the conversation (replies are what the customer saw, notes are internal).',
    scope: 'ticket-detail:read',
    method: 'GET',
    path: '/api/v1/tickets/{id}',
    pathParams: ['id'],
    props: {
      id: ticketId,
      comments: bool('Also return the comments'),
      comments_limit: int('Most comments (default 100, max 500)'),
      comments_order: str('asc (oldest first, default) or desc'),
      comment_visibility: str('reply = what the customer saw, note = internal notes'),
    },
    required: ['id'],
  },
  {
    name: 'get_ticket_history',
    description: 'The history of a ticket: who changed what and when, with the old and new value of each field. Entries made through the API are marked via_api. This is the record of changes, not of conversation.',
    scope: 'ticket-detail:read',
    method: 'GET',
    path: '/api/v1/tickets/{id}/activity',
    pathParams: ['id'],
    props: { id: ticketId, order: str('desc (newest first, default) or asc'), ...paging },
    required: ['id'],
  },
  {
    name: 'list_users',
    description: 'Find active team members with their shift and skills.',
    scope: 'users:read',
    method: 'GET',
    path: '/api/v1/users',
    props: {
      q: str('Name or email contains'),
      email: str('Email(s), comma separated'),
      role: str('admin, operations, manager or staff'),
      skill: str('Skill name(s), comma separated'),
      min_level: int('With skill: lowest skill level, 1 to 10'),
      ...paging,
    },
  },
  {
    name: 'get_person_work',
    description:
      'What one person worked on and for how long: tracked hours per day, per company and per ticket, capacity and utilization, the running timer, leave in the range, and everything unfinished assigned to them now. Give a range with from/to, or hours (last N hours), or since.',
    scope: 'users:read',
    method: 'GET',
    path: '/api/v1/users/work',
    props: {
      email: str('The person (email)'),
      from: str('First day (YYYY-MM-DD, WIB). Default today'),
      to: str('Last day (YYYY-MM-DD)'),
      hours: int('Instead of a date range: the last N hours (1 to 720)'),
      since: str('Instead: a start time with offset, e.g. 2026-11-10T08:00:00+07:00'),
      until: str('With since: an end time'),
      include: str('sessions = also every single time entry'),
      assigned_limit: int('Most assigned tickets listed (default 100, max 500)'),
      assigned_offset: int('Skip this many assigned tickets'),
    },
    required: ['email'],
  },
  {
    name: 'get_team_work',
    description: 'Work and tracked hours of every active agent in one call, most hours first, including people who tracked nothing. Same range options as get_person_work.',
    scope: 'users:read',
    method: 'GET',
    path: '/api/v1/work',
    props: {
      from: str('First day (YYYY-MM-DD, WIB). Default today'),
      to: str('Last day (YYYY-MM-DD)'),
      hours: int('Instead of a date range: the last N hours (1 to 720)'),
      since: str('Instead: a start time with offset'),
      until: str('With since: an end time'),
    },
  },
  {
    name: 'get_team_load',
    description: 'Every active agent with the tickets assigned to them that still need work (open, received, working_team by default), counts, load level and the unassigned breakdown. Use it for "who has room?" and "what is on X\'s plate?".',
    scope: 'team-load:read',
    method: 'GET',
    path: '/api/v1/team-load',
    props: {
      email: str('Only this agent (comma separated)'),
      role: str('Only these roles'),
      status: str('Count these statuses instead of the default'),
      tickets: str('0 = counts only, no ticket lists'),
      include: str('unassigned = also list tickets nobody has'),
      limit_per_agent: int('Most tickets listed per agent (default 50, max 200)'),
      ...paging,
    },
  },
  {
    name: 'suggest_takeover',
    description: 'Who could take over the unfinished tickets of a person (or one ticket), ranked on skill match, leave until the due date, shift and load. It only suggests; nothing is assigned.',
    scope: 'team-load:read',
    method: 'GET',
    path: '/api/v1/team-load/suggest',
    props: { from_email: str('The person whose tickets need cover (email)'), ticket_id: int('Or one ticket number'), ticket_limit: int('Most tickets (default 20, max 50)') },
  },
  {
    name: 'list_companies',
    description: 'Companies with their ids, plan hours, account manager, PICs and active ticket counts.',
    scope: 'companies:read',
    method: 'GET',
    path: '/api/v1/companies',
    props: {
      q: str('Name contains'),
      id: str('Company id(s), comma separated'),
      customer: str('1 = customers only, 0 = internal only'),
      include_inactive: str('1 = also switched-off companies'),
      sort: str('name (default) or active_tickets'),
      ...paging,
    },
  },
  {
    name: 'get_calendar',
    description: 'Calendar entries and holidays in a date range (birthdays, leave, duty, events), optionally for one person. At most 366 days.',
    scope: 'calendar:read',
    method: 'GET',
    path: '/api/calendar/events',
    props: {
      from: str('First date (YYYY-MM-DD)'),
      to: str('Last date (YYYY-MM-DD)'),
      type: str('birthday, holiday, leave, duty, event (comma separated). Default all'),
      email: str('Only this person'),
      include: str('tickets = tickets falling due in the range; assigned_tickets = what people on leave still hold (needs Tickets read access)'),
      done: str('0 = leave finished tickets out'),
    },
    required: ['from', 'to'],
  },
  {
    name: 'get_person_availability',
    description: 'Day-by-day availability of one team member: weekend, holiday, leave or duty. "available" is false on weekends, holidays and leave; duty does not make someone unavailable.',
    scope: 'calendar:read',
    method: 'GET',
    path: '/api/calendar/user-status',
    props: { email: str('The person (email)'), from: str('First date (YYYY-MM-DD)'), to: str('Last date (YYYY-MM-DD)') },
    required: ['email', 'from', 'to'],
  },
  {
    name: 'add_note',
    description:
      'CHANGES DATA. Add an internal note to a ticket (never visible to the customer). Show the user the text first and wait for their yes. The note is marked "via API" with your name.',
    scope: 'notes:write',
    method: 'POST',
    path: '/api/v1/tickets/{id}/notes',
    pathParams: ['id'],
    props: { id: ticketId, text: str('The note, plain text, up to 20000 characters'), via },
    required: ['id', 'text'],
  },
  {
    name: 'update_ticket',
    description:
      'CHANGES DATA and can email people. Change a ticket: status, due date, assignees, skills or tags. Lists add or remove, never replace. Closing a ticket sends the usual closing email and assigning notifies the person. Show the user exactly what will change and wait for their yes. Tags and skills must already exist (see get_catalog).',
    scope: 'tickets:update',
    method: 'PATCH',
    path: '/api/v1/tickets/{id}',
    pathParams: ['id'],
    props: {
      id: ticketId,
      status: str('A status slug from get_catalog'),
      due_date: str('YYYY-MM-DD (end of that day, WIB), a date and time with offset, or "null" to clear'),
      add_assignee_emails: list('People to add (active team members)'),
      remove_assignee_emails: list('People to take off'),
      add_skills: list('Skill names to add'),
      remove_skills: list('Skill names to remove'),
      primary_skill: str('The main skill (must be one of the ticket\'s skills)'),
      add_tags: list('Existing tag names to add'),
      remove_tags: list('Tag names to remove'),
      via,
    },
    required: ['id'],
  },
  {
    name: 'create_ticket',
    description:
      'CHANGES DATA and emails the requester. Create a support ticket as the key owner. Show the user the title, company, customer and assignees first and wait for their yes. Search for an existing ticket first to avoid duplicates. Never invent a company, customer or assignee.',
    scope: 'tickets:create',
    method: 'POST',
    path: '/api/v1/tickets',
    props: {
      title: str('Up to 250 characters'),
      description: str('Plain text, up to 20000 characters; a blank line starts a new paragraph'),
      company_id: str('From list_companies'),
      contact_email: str('The customer the ticket is for'),
      type: str('Ticket type slug (see get_catalog)'),
      status: str('A status slug. Default open'),
      priority: int('Place in the company queue: 1 is first; leave out for the end'),
      due_date: str('YYYY-MM-DD (end of that day, WIB) or a date and time with offset'),
      team_id: str('A team id from get_catalog'),
      assignee_emails: list('Active team members; they are notified'),
      tags: list('Existing tag names'),
      skills: list('Skill names'),
      primary_skill: str('The main skill'),
      via,
    },
    required: ['title'],
  },
]

export const MCP_INSTRUCTIONS = [
  'DeskTeam360 helpdesk. Times are in WIB (UTC+7). Every call is made with the user\'s API key and sees only what that key and its owner may see.',
  'Tools that say CHANGES DATA change real tickets and can email customers or notify people: show the user what will change and wait for a clear yes first.',
  'Notes are internal. Never present an internal note as something the customer was told.',
  'If a call answers with a rate limit (429), tell the user the limit and the reset_at time, and do not retry before then.',
  'Lists that can be long say has_more and next_offset: keep asking with offset=next_offset until has_more is false before you total or compare anything.',
  'Load: load_level is normal up to 5 active tickets (open, received, working_team), warning from 6 and critical from 10. A ticket with two assignees counts for both.',
  'Hours come from the time tracker only. Before you say someone worked little, check leave, holidays and shift (capacity_hours, calendar entries, get_person_availability): low utilization during leave is not slacking. Do not rank or judge people on one number.',
  'Overdue means past the due date and not finished. Finished statuses are listed by get_catalog (closed_like).',
].join('\n')

export function toolInputSchema(t: McpTool) {
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(t.props).map(([k, p]) => [k, p])),
    ...(t.required?.length ? { required: t.required } : {}),
    additionalProperties: false,
  }
}

/** The path and the query or body for a tool call, from the arguments the AI sent. */
export function buildToolRequest(t: McpTool, args: Record<string, unknown>, defaultVia: string): { path: string; query: string; body: string | null } | { error: string } {
  let path = t.path
  for (const p of t.pathParams ?? []) {
    const v = args[p]
    if (v === undefined || v === null || v === '') return { error: `Missing "${p}"` }
    path = path.replace(`{${p}}`, encodeURIComponent(String(v)))
  }
  const rest = Object.fromEntries(Object.entries(args).filter(([k, v]) => !(t.pathParams ?? []).includes(k) && v !== undefined && v !== null && k in t.props))
  if (t.method === 'GET') {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(rest)) q.set(k, Array.isArray(v) ? v.join(',') : typeof v === 'boolean' ? (v ? 'true' : '0') : String(v))
    return { path, query: q.toString(), body: null }
  }
  const body: Record<string, unknown> = { ...rest }
  if ('via' in t.props && !body.via) body.via = defaultVia
  if (body.due_date === 'null') body.due_date = null
  return { path, query: '', body: JSON.stringify(body) }
}
