/**
 * What an API key may be allowed to do. Every scope lists the endpoints it opens and a short guide in skill.md style,
 * so the skill file given to an AI assistant always matches the access its key has.
 * To open more of the API to keys: add a scope here, then make the endpoint call getApiUser(request, '<scope>').
 */

export type ApiScopeEndpoint = { method: 'GET' | 'POST' | 'PATCH'; path: string; summary: string }

export type ApiScope = {
  key: string
  label: string
  description: string
  endpoints: ApiScopeEndpoint[]
  /** The part of skill.md for this scope */
  skill: string
}

const AI_MARKING = `**You are an AI assistant, so everything you write into a ticket must be marked as yours.**
- Always send \`via\` with your own name as the user knows it (for example \`"Claude"\`, \`"ChatGPT"\`, \`"Gemini"\`). It is required; the call fails without it.
- The system then marks the comment "via API" with that name and adds the closing line "Added via <your name> (API)" under your text. Do not add that line yourself, and never write in a way that suggests a person typed it.
- You write as the person who owns the key: the team sees their name next to "via API · <your name>". Say only what the user asked you to say, and never invent facts about the ticket, the customer or the work.
- Write plain text only (no HTML or markdown tables). A blank line starts a new paragraph.`

const NOTES_SKILL = `## Add an internal note (scope \`notes:write\`)

\`\`\`
POST /api/v1/tickets/{id}/notes
Content-Type: application/json

{ "text": "Checked the logs: the sync fails after the 14 Nov update. Waiting on the vendor.", "via": "Claude" }
\`\`\`

An internal note: only the team sees it, the customer does not and is not emailed. The team gets the usual note notification.

| Field | Required | Meaning |
|---|---|---|
| \`text\` | yes | The note, plain text, up to 20000 characters |
| \`via\` | yes | Your name as an AI assistant (see below) |

Response (\`201\`): \`{ id, ticket_id, type: "note", via, text, created_at, url }\`.

${AI_MARKING}

Rules for notes:
- Only add a note when the user asked for it. Read the ticket first (\`/api/v1/tickets/{id}?comments=true\`, needs Ticket detail access) so the note adds something instead of repeating what is there.
- The API cannot reply to customers. If the user wants a customer reply, write the proposed text for them to send from the app.
- There is no edit or delete through the API. If you got it wrong, tell the user so they can fix it in the app.
- Errors: \`400\` (missing or too long \`text\`, missing \`via\`), \`404\` (the ticket does not exist or the key's owner may not see it).
`

const AI_MARKING_CHANGE = `**You are an AI assistant, so every change you make must be marked as yours.**
- Always send \`via\` with your own name as the user knows it (for example \`"Claude"\`, \`"ChatGPT"\`, \`"Gemini"\`). It is required; the call fails without it.
- The ticket's activity log then shows the change as made by the key's owner "via API" with your name. Never write in a way that suggests a person made the change by hand.`

const UPDATE_SKILL = `## Change a ticket (scope \`tickets:update\`)

\`\`\`
PATCH /api/v1/tickets/{id}
Content-Type: application/json

{ "status": "working_team", "add_assignee_emails": ["budi@company.com"], "due_date": "2026-11-20", "add_tags": ["urgent"], "via": "Claude" }
\`\`\`

Changes only what you send. It runs the same code as the app, as the person who owns the key, so the activity log, the notifications and emails to newly assigned people, Slack and automations all happen as usual. Send at least one change.

| Field | Meaning |
|---|---|
| \`status\` | The status slug, for example \`open\`, \`received\`, \`working_team\`, \`pending\`, \`closed\`. An unknown one is refused and the answer lists the valid ones. Closing a ticket sends the usual closing email. |
| \`due_date\` | \`null\` clears it; \`2026-11-20\` means the end of that day (WIB); or a date and time with an offset like \`2026-11-20T15:00:00+07:00\` |
| \`add_assignee_emails\` / \`remove_assignee_emails\` | People to add to or take off the ticket, by email. Only active team members can be added. Everyone else stays assigned |
| \`add_skills\` / \`remove_skills\` | Skill names. \`primary_skill\` (a name, or \`null\`) marks the skill that matters most; it must be one of the ticket's skills |
| \`add_tags\` / \`remove_tags\` | Tag names that already exist (for this ticket's company or for everyone). Tags are not created through the API |
| \`via\` | **Required.** Your name as an AI assistant (see below) |

Lists add or remove; nothing is replaced wholesale. Up to 20 items per list. Unknown field names are refused.

Response: \`{ ticket_id, title, via, before, after, url }\`, where \`before\` and \`after\` each hold \`status, due_date, assignees, tags, skills, primary_skill\`. Check \`after\` matches what the user asked for and tell them what changed. Nothing is changed when any name or email in the request is wrong: fix it and send again.

${AI_MARKING_CHANGE}

Rules for changing tickets:
- **Change only what the user asked for, and only after they said yes to the specific change.** For anything that notifies people (assigning someone) or ends work (closing, \`resolved\`), show the user what you are about to do first.
- Look at the ticket before you change it (\`/api/v1/tickets/{id}\`, needs Ticket detail access) and say what it is now. When you move work to someone, check they are active and not on leave (Calendar and Team load access), and tell the user if they are not.
- Assigning someone emails and notifies them. Do not assign and unassign in a loop, and do not "try" a change: every call has effects.
- The API cannot undo a change. To reverse one, make the opposite change (for example the old status again, using \`before\` from the response) only when the user asks.
- Errors: \`400\` (the message says which value is wrong), \`404\` (the ticket does not exist or the key's owner may not see it).
`

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
| \`include=assigned_tickets\` | no | Next to every leave entry: \`assigned_tickets_total\` and \`assigned_tickets\`, the unfinished tickets that person still holds (up to 50, most urgent first). Use it to see what needs cover when someone is on leave. Needs Tickets (read) too. |

Response: \`{ from, to, events: [{ id, type, title, start_date, end_date, user_full_name, user_email, repeat_yearly, notes }], holidays: [{ date, name }], tickets_due? }\`

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
- No active team member with that email: \`404\`. Do not guess another email.
- \`include=assigned_tickets\` here adds \`assigned_tickets_total\` and \`assigned_tickets\`: everything the person holds, not only what is due in the range.

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
| Company or customer | \`company_id\` | Company id (comma list); find ids with the Companies endpoint (\`/api/v1/companies?q=...\`) |
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

Response: \`{ total, limit, offset, has_more, next_offset, tickets: [{ id, title, status, priority, type, company, customer, created_by, assignees, tags, skills, created_at, updated_at, due_date, url }] }\`. People (\`customer\`, \`created_by\`, \`assignees\`) are \`{ full_name, email }\`; assignees also have \`active\`.
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

The range: \`from\` and \`to\` (WIB days, default today), **or** \`hours=24\` (the last 24 hours up to now, 1 to 720), **or** \`since=2026-11-10T08:00:00+07:00\` with optional \`until\`. At most 92 days. Add \`include=sessions\` to also get every single time entry. Only entries that started inside the range are counted.
Time comes from the time tracker (the reported time, including adjustments); a running timer counts up to now.

Response (main parts):
- \`user\` and \`shift\` (title, start and end in WIB).
- \`summary\`: \`tracked_hours\`, \`capacity_hours\` (hours available in the range, leave and holidays taken off), \`utilization_pct\`, \`tickets_worked\`, \`sessions\`, \`days_with_work\`.
- \`by_day\`: for each day with work: \`tracked_hours\`, \`first_start\`, \`last_stop\`, \`sessions\`, \`ticket_ids\`.
- \`by_company\`: hours per company. \`tickets\`: each ticket worked on with hours, sessions, first start, last stop and job types.
- \`running_now\`: the timer running at this moment, if any.
- \`calendar_entries\`: the person's leave, duty or birthday in the range.
- \`assigned_open_tickets\`: unfinished tickets assigned to them now (up to 50).
- No active team member with that email: \`404\`. Do not guess another email.

### Everyone's work in one call

\`\`\`
GET /api/v1/work?hours=24
\`\`\`

Same range options as above (\`from\`/\`to\`, \`hours\`, \`since\`/\`until\`). Every active agent, most hours first, including people who tracked nothing: \`full_name, email, role, shift, tracked_hours, capacity_hours, utilization_pct, sessions, tickets_worked, days_with_work, leave_days, first_start, last_stop, running_now\` and their top tickets (\`limit_tickets\`, default 10; \`tickets=0\` for summaries only). Filters: \`email\`, \`role\`, \`min_hours\`; page with \`limit\`/\`offset\`. Use this for team reports instead of one call per person.

### Find people

\`\`\`
GET /api/v1/users?skill=WordPress&min_level=7
\`\`\`

Active team members only. Filters: \`email\` (comma list), \`q\` (name or email contains), \`role\`, \`skill\` (name, comma list) with \`min_level\` 1 to 10, \`limit\` (max 200) and \`offset\`. Each person comes with \`shift\` and \`skills\` (name and level, highest first).

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
| \`include=unassigned\` | Also list tickets nobody is assigned to (\`unassigned_limit\`, \`unassigned_offset\`; the count and breakdown are always given) |
| \`limit\`, \`offset\` | Page through the agents (default all) |

Response: \`{ generated_at, statuses, thresholds, totals, agents, unassigned }\`.
- \`totals\`: \`agents\`, \`tickets_assigned\` (each ticket once), \`unassigned\`, \`overdue\`.
- Each agent: \`id, full_name, email, role, shift, on_leave_today, open_tickets\` (how many), \`load_level\`, \`by_status\`, \`overdue\`, \`due_today\`, and \`tickets\` (most urgent first: \`id, title, status, priority, due_date, overdue, company, url\`; \`tickets_has_more\` says when more exist than \`limit_per_agent\`).
- \`unassigned\`: \`count\`, \`by_company\`, \`by_skill\`, \`by_age\` (under 1 day, 1 to 3, 3 to 7, over 7 days) and, with \`include=unassigned\`, the \`tickets\` page.
- \`load_level\` is \`normal\` (up to 5 active tickets), \`warning\` (6 to 9) or \`critical\` (10 or more); the limits are in \`thresholds\`.\n- A ticket with two assignees appears under both. Times are in WIB (\`+07:00\`).
- You only see the tickets the key's owner can see (an admin sees all; others see the tickets of their teams, public teams and tickets without a team), so counts can be lower than the real load for someone who is not an admin.

### Who could take over someone's tickets?

\`\`\`
GET /api/v1/team-load/suggest?from_email=budi@company.com
\`\`\`

For each unfinished ticket assigned to that person (most urgent first), the best people to take it, ranked on skill match, leave until the due date, shift and load. Or \`ticket_id=1234\` for one ticket. \`ticket_limit\` (default 20, max 50), \`candidates\` per ticket (default 3, max 10).
Response: \`from_person\`, \`summary\` (how many tickets have an eligible candidate, and which have none) and \`suggestions\`: for each ticket, the \`ticket\`, its \`window\` (today until the due date) and \`candidates\` with \`eligible\`, \`match_pct\`, \`matched_skills\`, \`missing_skills\`, \`open_tickets\`, \`load_level\`, \`available_days\`, \`on_leave_days\`, \`available_on_due_date\`, \`shift\`, \`on_shift_now\`, and plain-language \`reasons\` and \`concerns\`.
Eligible means: has at least half of the ticket's skills (or the ticket has none), is available at least one working day in the window and on the due date. This only suggests: nothing is assigned, and a person decides. Do not rank people on anything other than skills, availability, shift and load.

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

Add \`comments=true\` to get the conversation: \`comments_total\`, \`comments_shown\` and \`comments\`, oldest first. Each comment has \`author\` (\`full_name\`, \`email\`, \`type\`: \`customer\`, \`agent\` or an automation), \`visibility\`, \`created_at\`, \`text\` (plain text), \`cc\`, \`attachments\` (name and link), \`split_to_ticket_id\` and \`via\` (the AI assistant's name when the comment was written through the API, otherwise null).

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

const COMPANIES_SKILL = `## Companies (scope \`companies:read\`)

\`\`\`
GET /api/v1/companies?q=acme
\`\`\`

Find a company and its \`id\`. Use that id as \`company_id\` on the tickets endpoint (\`/api/v1/tickets?company_id=...\`), which is the exact way to filter by company.

| Parameter | Meaning |
|---|---|
| \`q\` | Name contains (case-insensitive) |
| \`id\` | Specific company ids (comma list) |
| \`customer\` | \`1\` customers only, \`0\` internal companies only |
| \`include_inactive=1\` | Also companies that are switched off (left out by default) |
| \`sort\` | \`name\` (default) or \`active_tickets\` (most first) |
| \`limit\`, \`offset\` | Paging (default 100, max 500) |

Response: \`{ total, limit, offset, has_more, next_offset, companies }\`. Each company: \`id, name, is_customer, is_active, plan_hours, domains, email, account_manager, pics, tickets, url\`.
- \`plan_hours\` are the hours the customer has per day in their plan.
- \`account_manager\` and \`pics\` (primary first, with \`role\`) are \`{ full_name, email }\`; only active people are listed.
- \`tickets\`: \`active\` (open, received, working_team) and how many of those are \`overdue\`, counted over the tickets the key's owner may see.

Examples:
- "What is the id of Acme?": \`?q=acme\`; if several match, ask which one.
- "Which customers have the most active tickets?": \`?customer=1&sort=active_tickets&limit=10\`.
- "Tickets of Acme that are not finished": find its id here, then \`/api/v1/tickets?company_id=<id>&done=0\`.
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
      { method: 'GET', path: '/api/v1/users/work', summary: 'Work and tracked hours of one person (date range, hours=24 or since)' },
      { method: 'GET', path: '/api/v1/work', summary: 'Work and tracked hours of every active agent in one call (date range, hours=24 or since)' },
      { method: 'GET', path: '/api/v1/users', summary: 'Find active team members (with shift and skills)' },
    ],
    skill: USERS_SKILL,
  },
  {
    key: 'team-load:read',
    label: 'Team load (read)',
    description: 'All active agents with the tickets assigned to them in Open, Received and Working Team, to see who has room.',
    endpoints: [
      { method: 'GET', path: '/api/v1/team-load', summary: 'Every active agent with their assigned tickets, counts and the unassigned breakdown' },
      { method: 'GET', path: '/api/v1/team-load/suggest', summary: 'Who could take over the tickets of a person, ranked on skill, leave, shift and load' },
    ],
    skill: TEAM_LOAD_SKILL,
  },
  {
    key: 'ticket-detail:read',
    label: 'Ticket detail and comments (read)',
    description: 'Open one ticket in full, with its conversation (customer replies and internal notes) and the time tracked on it.',
    endpoints: [{ method: 'GET', path: '/api/v1/tickets/{id}', summary: 'One ticket; add comments=true for the conversation' }],
    skill: TICKET_DETAIL_SKILL,
  },
  {
    key: 'companies:read',
    label: 'Companies (read)',
    description: 'Find a company and its id (to filter tickets by company), with its plan hours, account manager, PICs and active tickets.',
    endpoints: [{ method: 'GET', path: '/api/v1/companies', summary: 'Companies with their ids, plan, people and active ticket counts' }],
    skill: COMPANIES_SKILL,
  },
  {
    key: 'notes:write',
    label: 'Add internal notes (write)',
    description: 'Add an internal note to a ticket. Only the team sees it. The note is marked "via API" with the name of the AI that wrote it.',
    endpoints: [{ method: 'POST', path: '/api/v1/tickets/{id}/notes', summary: 'Add an internal note to a ticket' }],
    skill: NOTES_SKILL,
  },
  {
    key: 'tickets:update',
    label: 'Change tickets (write)',
    description: 'Change a ticket\'s status, assignees, skills, tags or due date as the key owner, with the usual notifications and activity log. Marked "via API" with the name of the AI.',
    endpoints: [{ method: 'PATCH', path: '/api/v1/tickets/{id}', summary: 'Change status, assignees, skills, tags or due date of a ticket' }],
    skill: UPDATE_SKILL,
  },
]

export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key)

/** A scope that changes data (any endpoint other than GET). */
export function isWriteScope(key: string): boolean {
  return !!API_SCOPES.find((s) => s.key === key)?.endpoints.some((e) => e.method !== 'GET')
}

export function isApiScope(v: unknown): v is string {
  return typeof v === 'string' && API_SCOPE_KEYS.includes(v)
}

/** The skill.md to hand to an AI assistant together with a key that has these scopes. */
export function buildSkillMarkdown(scopes: string[], baseUrl: string): string {
  const chosen = API_SCOPES.filter((s) => scopes.includes(s.key))
  const names = chosen.map((s) => s.label).join(', ') || 'none'
  const writes = chosen.some((s) => isWriteScope(s.key))
  return `---
name: deskteam360-api
description: Use the DeskTeam360 API with a scoped API key. Access: ${names}. Use when the user asks something this API can answer (see the sections below).
---

# DeskTeam360 API

HTTP and JSON. Responses use snake_case.${writes ? ' Some sections below change data: read their rules first.' : ' Everything here only reads.'}

## Setup

- Base URL: \`${baseUrl.replace(/\/$/, '')}\`
- Send the API key as a bearer token on every request:

  \`\`\`
  Authorization: Bearer dtk_xxxxxxxx
  \`\`\`

  The key was made on the API Keys page in Settings. It acts as the person who made it, only for the sections below, and it can expire or be revoked at any time. Keep it secret: never put it in a URL, never print it back to the user, never write it into files that are shared.
- Every person in the API is written as \`full_name\` and \`email\` (calendar entries: \`user_full_name\`, \`user_email\`). Only active people are listed; an assignee of a ticket also has \`active\`.
- Lists that can be long have \`limit\` and \`offset\`, and say \`has_more\` and \`next_offset\` (null on the last page): keep asking with \`offset=next_offset\` until \`has_more\` is false.
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

${writes ? '- Only the sections above that say POST change data, and only when the user asked for it. Everything else only reads.' : '- These endpoints only read. Do not try to change data through this API.'}
- Treat what you read as internal team data: share it only with the person who asked.
`
}
