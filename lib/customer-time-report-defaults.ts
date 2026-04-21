import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(isoWeek)

export const CUSTOMER_TIME_REPORT_PRESET_TITLE_MAX = 200
export const CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT = 'Saved filter'

/** Trim and clamp; empty input becomes default label. */
export function normalizePresetTitle(raw: unknown): string {
  if (typeof raw !== 'string') return CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT
  const t = raw.trim()
  if (!t) return CUSTOMER_TIME_REPORT_PRESET_TITLE_DEFAULT
  return t.length > CUSTOMER_TIME_REPORT_PRESET_TITLE_MAX
    ? t.slice(0, CUSTOMER_TIME_REPORT_PRESET_TITLE_MAX)
    : t
}

export const CUSTOMER_TIME_REPORT_DATE_PRESET_KEYS = [
  'this_week',
  'last_week',
  'this_month',
  'last_month',
] as const

export type CustomerTimeReportDatePresetKey = (typeof CUSTOMER_TIME_REPORT_DATE_PRESET_KEYS)[number]

export type CustomerTimeReportDatePreset = CustomerTimeReportDatePresetKey | null

export const CUSTOMER_TIME_REPORT_DATE_PRESET_LABELS: Record<CustomerTimeReportDatePresetKey, string> = {
  this_week: 'This week (Mon–Sun)',
  last_week: 'Last week (Mon–Sun)',
  this_month: 'This month',
  last_month: 'Last month',
}

export const CUSTOMER_TIME_REPORT_DATE_PRESET_OPTIONS = CUSTOMER_TIME_REPORT_DATE_PRESET_KEYS.map((k) => ({
  value: k,
  label: CUSTOMER_TIME_REPORT_DATE_PRESET_LABELS[k],
}))

export function normalizeDatePreset(raw: unknown): CustomerTimeReportDatePreset {
  if (raw == null || raw === '') return null
  const s = String(raw).trim().toLowerCase().replace(/-/g, '_')
  if ((CUSTOMER_TIME_REPORT_DATE_PRESET_KEYS as readonly string[]).includes(s)) {
    return s as CustomerTimeReportDatePresetKey
  }
  return null
}

/**
 * Resolve a rolling preset to concrete [start, end] in local time (for display + API).
 * Weeks use ISO week (Monday–Sunday). Months use calendar months.
 */
export function resolveDatePresetToRange(
  preset: CustomerTimeReportDatePreset,
  now: Dayjs = dayjs()
): { start: Dayjs; end: Dayjs } | null {
  if (!preset) return null
  switch (preset) {
    case 'this_month':
      return {
        start: now.startOf('month').startOf('day'),
        end: now.endOf('month').endOf('day'),
      }
    case 'last_month': {
      const m = now.subtract(1, 'month')
      return {
        start: m.startOf('month').startOf('day'),
        end: m.endOf('month').endOf('day'),
      }
    }
    case 'this_week':
      return {
        start: now.startOf('isoWeek').startOf('day'),
        end: now.endOf('isoWeek').endOf('day'),
      }
    case 'last_week': {
      const w = now.subtract(1, 'week')
      return {
        start: w.startOf('isoWeek').startOf('day'),
        end: w.endOf('isoWeek').endOf('day'),
      }
    }
    default:
      return null
  }
}

/** Stored JSON in `customer_time_report_defaults.filters` (one row per named preset). */
export type CustomerTimeReportGlobalFilters = {
  company_ids: string[]
  /** When set, UI filters by team(s); companies are derived from `active_team_id`. Legacy presets omit this. */
  team_ids: string[] | null
  start: string | null
  end: string | null
  /** When set, start/end are ignored until load time; range is recomputed from “now”. */
  date_preset: CustomerTimeReportDatePreset
  status_slugs: string[] | null
  urgent_only: boolean
}

export type CustomerTimeReportPresetDTO = {
  id: number
  title: string
  filters: CustomerTimeReportGlobalFilters
  updated_at: string | null
  updated_by: string | null
}

export function emptyGlobalFilters(): CustomerTimeReportGlobalFilters {
  return {
    company_ids: [],
    team_ids: null,
    start: null,
    end: null,
    date_preset: null,
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

  if (Array.isArray(o.team_ids) && o.team_ids.length > 0) {
    base.team_ids = [...new Set(o.team_ids.map((id) => String(id).trim()).filter(Boolean))]
  } else {
    base.team_ids = null
  }

  base.date_preset = normalizeDatePreset(o.date_preset)
  if (base.date_preset) {
    base.start = null
    base.end = null
  } else {
    const start = o.start != null && String(o.start).trim() ? String(o.start).trim() : null
    const end = o.end != null && String(o.end).trim() ? String(o.end).trim() : null
    base.start = start
    base.end = end
  }

  if (Array.isArray(o.status_slugs) && o.status_slugs.length > 0) {
    base.status_slugs = o.status_slugs.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
  }

  base.urgent_only = Boolean(o.urgent_only)

  return base
}
