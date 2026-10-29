---
name: deskteam360-calendar
description: Read the DeskTeam360 team calendar (leave, duty, birthdays, holidays, other events) for a date range and check whether a team member is available on given days, by email. Use when someone asks who is on leave or on duty, whether a person can take work on a date, which holidays fall in a period, or whose birthday is coming up.
---

# DeskTeam360 calendar API

Read-only endpoints over HTTP and JSON. All dates are calendar dates in `YYYY-MM-DD` (WIB, UTC+7). Responses use snake_case.

## Setup

- Base URL: the DeskTeam360 site address (for example `https://helpdesk.example.com`). Ask the user if you do not know it.
- Authentication: an API key as a bearer token on every request.

  ```
  Authorization: Bearer dtk_xxxxxxxx
  ```

  A Team Leader, Operations or Admin makes the key in the app under **Settings, API Keys**, choosing the access it gets (for this file: **Calendar (read)**). The key is shown once, expires (at most a year), acts as the person who made it, and only for the access they chose. Keep it secret and never print it back to the user. The same page can download a skill.md that matches the key's access.
- Do not send credentials in the query string or log them.

## 1. Entries in a date range

```
GET /api/calendar/events?from=2026-11-01&to=2026-11-30
```

| Parameter | Required | Meaning |
|---|---|---|
| `from`, `to` | yes | First and last date, inclusive. At most 366 days. |
| `type` | no | Comma list of `birthday`, `holiday`, `leave`, `duty`, `event`. Default: all. |
| `email` | no | Only the entries of the person with this email (case-insensitive). |
| `include` | no | `tickets` adds `tickets_due`: tickets that fall due in the range (with `email`: only those assigned to that person). Needs a key that also has Tickets (read). |
| `done` | no | `0` leaves finished tickets out of `tickets_due`. |

Response:

```json
{
  "from": "2026-11-01",
  "to": "2026-11-30",
  "events": [
    {
      "id": "6f1c...",
      "type": "leave",
      "title": "Budi - leave",
      "start_date": "2026-11-10",
      "end_date": "2026-11-12",
      "user_full_name": "Budi Santoso",
      "user_email": "budi@company.com",
      "repeat_yearly": false,
      "notes": null
    }
  ],
  "holidays": [{ "date": "2026-11-25", "name": "Public holiday" }]
}
```

Notes:
- Multi-day entries are one item with `start_date` and `end_date` (inclusive). Check overlap with `start_date <= day <= end_date`.
- Yearly entries (birthdays, some holidays) are already placed in the year(s) of the range; `repeat_yearly` only says that they repeat.
- `holidays` are the official non-working days. With `email`, or with a `type` that excludes `holiday`, the list is empty. Entries of type `holiday` are in `events`, so check both for a complete list.
- `user_full_name` and `user_email` are `null` for entries that belong to nobody (for example a general holiday).

## 2. Is this person available? (look up by email)

```
GET /api/calendar/user-status?email=budi@company.com&from=2026-11-09&to=2026-11-13
```

| Parameter | Required | Meaning |
|---|---|---|
| `email` | yes | The team member's email (case-insensitive). |
| `from`, `to` | no | Default: today (WIB) for both. At most 62 days. |

Response:

```json
{
  "user": { "id": "...", "full_name": "Budi Santoso", "email": "budi@company.com", "role": "staff", "status": "active" },
  "from": "2026-11-09",
  "to": "2026-11-13",
  "summary": { "days": 5, "available_days": 2, "leave_days": 3, "duty_days": 0, "holiday_days": 0 },
  "days": [
    {
      "date": "2026-11-10",
      "weekday": "Tuesday",
      "is_weekend": false,
      "holiday": null,
      "on_leave": true,
      "on_duty": false,
      "birthday": false,
      "available": false,
      "entries": [{ "id": "6f1c...", "type": "leave", "title": "Budi - leave", "notes": null }]
    }
  ]
}
```

- `available` is true when the day is not a weekend, not a holiday, and the person is not on leave. Duty (piket) does not make someone unavailable: say "on duty" instead.
- A person who is not found, or is not a team member, returns `404` with `{"error": "No active team member with that email"}`. Do not guess another email.

## How to answer common questions

- "Who is on leave next week?" Call `/api/calendar/events` with `type=leave` and the week's dates; list `user_full_name` with the date range.
- "Can budi@company.com take a task on 12 Nov?" Call `/api/calendar/user-status` with `from=to=2026-11-12`; use `days[0].available`, and mention a holiday, leave, or duty entry as the reason.
- "Who is on duty this weekend?" Call `/api/calendar/events` with `type=duty` for Saturday to Sunday.
- "Any holidays in December?" Call `/api/calendar/events` for December and combine `holidays` with events of type `holiday`.
- "Whose birthday is this month?" Call with `type=birthday` for the month.
- For a long period, ask for the range you need, not a whole year when a month will do.

## Errors

| Status | Meaning | What to do |
|---|---|---|
| 400 | Missing or invalid parameter (the message says which), range too long, unknown `type` | Fix the request. |
| 401 | Missing, expired, revoked or switched-off key, or a key without Calendar access | Tell the user; ask for a new key or different access. Do not retry. |
| 403 | The key's owner is not allowed to use this | Tell the user. |
| 404 | No active team member with that email (`user-status`) | Tell the user the email was not found. |

## Rules

- These endpoints only read. Entries are added, edited, and deleted by Admin and Operations in the Calendar page of the app; do not try to change them through this API.
- Treat leave, duty, and birthday information as internal team data: share it only with the person who asked and do not repeat it elsewhere.
- Times of day are not stored. Entries cover whole days.
