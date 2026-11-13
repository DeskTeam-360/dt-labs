# Cron Jobs — DeskTeam360

All cron jobs run on the Lightsail server (`ubuntu@3.23.67.169`) via `crontab`.
Auth uses `Authorization: Bearer <secret>` read from `.env`.

## Cron Job List

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/email/sync-inbox` | Every 2 minutes | Sync email inbox (Gmail/IMAP), create tickets from incoming mail |
| `POST /api/cron/process-recurring-tickets` | Every 1 minute | Create tickets automatically from recurring rules that are due |
| `POST /api/cron/company-daily-active` | Every day at 00:05 UTC | Daily snapshot of active ticket counts per company |
| `POST /api/cron/customer-weekly-recap` | Every Sunday at 01:00 UTC | Materialize weekly recap data per team (heavy job, off-peak schedule) |
| `POST /api/cron/shift-schedule` | Daily 17:05 UTC (00:05 WIB), OPTIONAL | Moves people onto the shift of the period running today (Settings > Shifts > Schedule by period). Without it this happens the first time someone opens a screen that reads shifts or users that day. Secret: `SHIFT_CRON_SECRET` (falls back to `SYNC_INBOX_CRON_SECRET`) |
| `POST /api/cron/wp-monitor` | Every 5 minutes, OPTIONAL | WordPress monitoring on a timer: open each monitored site (uptime), update its alarms (red ones are emailed to the company PICs), trim old reports. Not needed for the checks that run when a crawl finishes or when someone presses Check now; add it only to be told about a site that is down between crawls |
| `POST /api/cron/pic-daily-digest` | Weekdays at 01:00 UTC (08:00 WIB) | Morning email to each PIC: overdue, unassigned and stale tickets of their companies, and WordPress sites with open alarms (`?dry_run=1` only counts, no email) |

## Secret / Auth

All cron endpoints use the same secret:

```
env var: SYNC_INBOX_CRON_SECRET  (also used by COMPANY_DAILY_ACTIVE_CRON_SECRET)
header:  Authorization: Bearer <value>
```

The secret is stored in `/var/www/dt-labs/.env` on the server.

## Crontab on Server

To view/edit active crons:

```bash
ssh -i "~/LightsailDefaultKey-us-east-2.pem" ubuntu@3.23.67.169
crontab -l        # list
crontab -e        # edit
```

Current crontab:

```cron
# Email inbox sync — every 2 minutes
*/2 * * * * curl -s -X POST https://ticket.deskteam360.com/api/email/sync-inbox \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-sync-inbox.log 2>&1

# Process recurring tickets — every minute
* * * * * curl -s -X POST https://ticket.deskteam360.com/api/cron/process-recurring-tickets \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-recurring.log 2>&1

# Company daily active snapshot — every day at 00:05 UTC
5 0 * * * curl -s -X POST https://ticket.deskteam360.com/api/cron/company-daily-active \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-company-daily.log 2>&1

# Customer weekly recap — every Sunday at 01:00 UTC
0 1 * * 0 curl -s -X POST https://ticket.deskteam360.com/api/cron/customer-weekly-recap \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-weekly-recap.log 2>&1

# WordPress monitoring on a timer, OPTIONAL — every 5 minutes (flock stops a slow run from overlapping the next)
*/5 * * * * flock -n /tmp/dt-labs-wp-monitor.lock curl -s -X POST https://ticket.deskteam360.com/api/cron/wp-monitor \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-wp-monitor.log 2>&1

# PIC morning email — weekdays at 01:00 UTC (08:00 WIB)
0 1 * * 1-5 curl -s -X POST https://ticket.deskteam360.com/api/cron/pic-daily-digest \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-pic-digest.log 2>&1
```

## Log Files

Each cron's output is stored on the server:

```
/var/log/dt-labs-sync-inbox.log       — latest email sync result
/var/log/dt-labs-recurring.log        — latest recurring ticket process result
/var/log/dt-labs-company-daily.log    — latest daily snapshot result
/var/log/dt-labs-weekly-recap.log     — latest weekly recap result
/var/log/dt-labs-wp-monitor.log       — latest WordPress monitoring run
/var/log/dt-labs-pic-digest.log       — latest PIC morning email run
```

Check the latest logs:

```bash
tail -f /var/log/dt-labs-recurring.log
tail -f /var/log/dt-labs-sync-inbox.log
```

## Adding a New Cron

1. Create an endpoint at `app/api/cron/<name>/route.ts`
2. Add an auth check using `SYNC_INBOX_CRON_SECRET` (or create a new secret in `.env`)
3. Install it on the server via `crontab -e`
4. Update the table in this document
