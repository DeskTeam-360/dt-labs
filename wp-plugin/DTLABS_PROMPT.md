# Prompt for the DTLabs project chat

Paste everything below into the chat of the project that has Company → Websites.

---

The WordPress plugin `deskteam360-monitor` (folder `wp-plugin/` in the Deskteam360 repo) sends a signed JSON report per site, already stored as described below. I want the monitoring side built here: a dashboard, alarms, and a link to Company → Websites.

## What already exists (branch `claude/wp-plugin-monitoring-8af8df`, Deskteam360 app, same DTLabs)
That app only handles the connection with WordPress. Do not rebuild it; read from it:
- Tables `wp_sites` (one row per site: `site_url`, `name`, `company_id`, `wp_version`, `php_version`, `last_report` jsonb, `last_seen_at`) and `wp_site_reports` (history: `site_id`, `payload` jsonb, `created_at`, kept 90 days). Migration: `drizzle/migrations/095_wp_sites.sql`.
- `POST /api/wp-monitor` receives and verifies the plugin's signed report (HMAC) and fills those tables.
- `GET/POST /api/wp-monitor/sites` (admin only) lists / registers sites (a key is returned once on register).
The dashboard and alarms below only need to read these tables (or that GET endpoint).

## Report payload (JSON)
- `site_url`, `site_name`, `sent_at`, `wp_version`, `php_version`
- `updates`: `core_update_available`, `core_latest`, `plugins[{slug,new_version}]`, `themes[{slug,new_version}]`
- `comments`: `approved`, `pending`, `spam`, `trash`, `recent[]`
- `gravityforms`: `active`, `version`, `forms[{id,title,total,last_24h,spam,recent[]}]`
- `wordfence`: `active`, `version`, `open_issues`, `issues[]`, `blocked_24h`, `log[]`
- `ssl`: `https`, `host`, `valid_to`, `days_left`, `expired`, `issuer`, `error?`
- `users`: `administrators[{id,login,email,registered}]`, `failed_logins_24h` (null without Wordfence), `failed_login_users[]`
- `backup`: `updraftplus` (false if not installed), `last_success`, `last_time`, `last_errors[]`, `latest_in_history`, `schedule_files`, `schedule_db`

## Build
1. **Company link:** `wp_sites.company_id` → Company → Websites. Match a registered site to the company website whose URL equals `site_url` (offer to pick manually if none). Show the site's health on the company's website row/page.
2. **Dashboard** (one table, all sites): name/company, WP and PHP version, pending updates (core/plugins/themes), SSL days left, last backup (age + success), failed logins 24h, Wordfence open issues, last report time. Status light per site: red / yellow / green (rules below). Click a site for details and report history.
3. **Alarms** (evaluate when a report arrives, plus a cron for "no report"; notify through the existing Slack notification rules and/or create a ticket via automation; do not repeat an open alarm, and clear it when the condition is gone):
   - No report for more than 3 hours (red)
   - SSL expired (red), days_left ≤ 14 (yellow)
   - PHP below 8.1 (yellow); core update available (yellow); 5 or more plugin updates pending (yellow)
   - Backup older than 7 days or last backup failed (red); UpdraftPlus not installed (grey/info)
   - New administrator not seen in the previous report (red)
   - failed_logins_24h above 50, Wordfence open_issues above 0 (yellow)
   - Comment spam or Gravity Forms last_24h jumping above 3x the site's recent average (yellow)
4. Keep it light: lint + type-check only, no long test runs.
