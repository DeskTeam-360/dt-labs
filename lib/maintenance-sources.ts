/** What the system can fill in by itself (see fillAutoItems in lib/maintenance-report.ts), and what a template may show around a report. */

export const MAINTENANCE_SOURCES: { value: string; label: string }[] = [
  { value: 'ssl', label: 'SSL certificate (expiry date)' },
  { value: 'plugin_updates', label: 'Plugin updates (WordPress Monitor)' },
  { value: 'malware', label: 'Malware (Wordfence)' },
  { value: 'broken_links', label: 'Broken links (latest crawl)' },
  { value: 'spam_comments', label: 'Spam comments waiting (WordPress Monitor)' },
  { value: 'spam_forms', label: 'Spam form entries waiting (Gravity Forms)' },
  { value: 'uploads_code_exec', label: 'Code execution off for Uploads (Wordfence)' },
  { value: 'file_manager', label: 'File Manager plugin removed' },
  { value: 'gravatar_off', label: 'Gravatar is off' },
  { value: 'dummy_user', label: 'Dummy or test administrator (warning)' },
  { value: 'domain_www', label: 'Domain with and without www' },
  { value: 'domain_https', label: 'Domain with and without https' },
  { value: 'shot_home_desktop', label: 'Homepage picture, desktop' },
  { value: 'shot_home_mobile', label: 'Homepage picture, mobile' },
  { value: 'shot_inner_desktop', label: '3 inner page pictures, desktop' },
  { value: 'shot_inner_mobile', label: '3 inner page pictures, mobile' },
]

/** Set by the system on a checklist item it filled with facts but that a person must still look at (pictures, form entries). */
export const NEED_CHECK = 'Need check'

export const MAINTENANCE_SOURCE_VALUES = MAINTENANCE_SOURCES.map((s) => s.value)

export const DEFAULT_BRANDING = {
  headerImageUrl: '/logo.jpg',
  footerText: 'www.DeskTeam360.com',
  colorPrimary: '#cc1068',
  colorSection: '#cdc1ee',
}

export type TemplateBrandingInput = {
  name: string
  headerTitle?: string | null
  headerSubtitle?: string | null
  headerImageUrl?: string | null
  footerText?: string | null
  footerImageUrl?: string | null
  colorPrimary?: string | null
  colorSection?: string | null
}

const hex = (v: string | null | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback)

/** What a report shows: the template's own header, footer and colours, and the built-in look where it has none. */
export function resolveBranding(t: TemplateBrandingInput) {
  return {
    title: t.headerTitle?.trim() || t.name,
    subtitle: t.headerSubtitle?.trim() || '',
    headerImageUrl: t.headerImageUrl?.trim() || DEFAULT_BRANDING.headerImageUrl,
    footerText: t.footerText === null || t.footerText === undefined ? DEFAULT_BRANDING.footerText : t.footerText.trim(),
    footerImageUrl: t.footerImageUrl?.trim() || '',
    colorPrimary: hex(t.colorPrimary, DEFAULT_BRANDING.colorPrimary),
    colorSection: hex(t.colorSection, DEFAULT_BRANDING.colorSection),
  }
}
