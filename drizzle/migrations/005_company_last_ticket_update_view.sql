-- Last ticket update per company (mirror logic: GET /api/companies last_ticket_updated_at).
-- Run on a secondary DB / staging / prod when you need this from SQL outside the app.
--
--   psql "$DATABASE_URL_SECOND" -f drizzle/migrations/005_company_last_ticket_update_view.sql
--   PowerShell: psql $env:DATABASE_URL -f drizzle/migrations/005_company_last_ticket_update_view.sql
--
-- Depends on: public.tickets (company_id, updated_at)

CREATE OR REPLACE VIEW company_last_ticket_update AS
SELECT
  company_id,
  max(updated_at) AS last_ticket_updated_at
FROM public.tickets
WHERE company_id IS NOT NULL
GROUP BY company_id;

COMMENT ON VIEW company_last_ticket_update IS 'Max tickets.updated_at per company_id; same aggregate as API companies list.';

-- Example join to company list (same as the "Last ticket update" column in the UI):
-- SELECT c.id, c.name, v.last_ticket_updated_at
-- FROM public.companies c
-- LEFT JOIN public.company_last_ticket_update v ON v.company_id = c.id;
