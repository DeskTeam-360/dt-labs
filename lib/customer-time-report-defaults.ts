/** Stored JSON in `customer_time_report_defaults.filters` (singleton row id = 1). */
export type CustomerTimeReportGlobalFilters = {
  company_ids: string[]
  start: string | null
  end: string | null
  status_slugs: string[] | null
  urgent_only: boolean
}

export const CUSTOMER_TIME_REPORT_DEFAULTS_ROW_ID = 1

export function emptyGlobalFilters(): CustomerTimeReportGlobalFilters {
  return {
    company_ids: [],
    start: null,
    end: null,
    status_slugs: null,
    urgent_only: false,
  }
}

export function normalizeGlobalFilters(raw: unknown): CustomerTimeReportGlobalFilters {
  const base = emptyGlobalFilters()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>

  if (Array.isArray(o.company_ids)) {
    base.company_ids = [...new Set(o.company_ids.map((id) => String(id).trim()).filter(Boolean))]
  }

  const start = o.start != null && String(o.start).trim() ? String(o.start).trim() : null
  const end = o.end != null && String(o.end).trim() ? String(o.end).trim() : null
  base.start = start
  base.end = end

  if (Array.isArray(o.status_slugs) && o.status_slugs.length > 0) {
    base.status_slugs = o.status_slugs.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
  }

  base.urgent_only = Boolean(o.urgent_only)

  return base
}
