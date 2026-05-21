-- Normalisasi: tiket support + company dapat priority rapat 1..n tanpa duplikasi; lalu UNIQUE (company_id, priority).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id
      ORDER BY
        CASE WHEN COALESCE(priority, 0) <= 0 THEN 2147483647 ELSE priority END,
        id
    ) AS rn
  FROM tickets
  WHERE ticket_type = 'support' AND company_id IS NOT NULL
)
UPDATE tickets t
SET priority = ranked.rn
FROM ranked
WHERE t.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_support_company_priority_unique
  ON tickets (company_id, priority)
  WHERE ticket_type = 'support' AND company_id IS NOT NULL;
