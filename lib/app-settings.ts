import { appSettings, db } from '@/lib/db'

export type AppSettingsMap = {
  app_name: string
  app_logo_url: string | null
  app_favicon_url: string | null
}

const DEFAULTS: AppSettingsMap = {
  app_name: 'DeskTeam360',
  app_logo_url: null,
  app_favicon_url: null,
}

/** Fetch all app settings from DB and return as a typed map. Falls back to defaults for missing keys. */
export async function getAppSettings(): Promise<AppSettingsMap> {
  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string | null>
  return {
    app_name: map['app_name'] ?? DEFAULTS.app_name,
    app_logo_url: map['app_logo_url'] ?? null,
    app_favicon_url: map['app_favicon_url'] ?? null,
  }
}

/** Upsert a single setting. */
export async function setAppSetting(key: keyof AppSettingsMap, value: string | null) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
}
