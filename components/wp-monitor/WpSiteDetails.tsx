'use client'

import { Descriptions, Space, Tag, Typography } from 'antd'

import type { WpFacts, WpHealthLevel, WpProblem } from '@/lib/wp-health'

const { Text } = Typography

export type WpSiteSummary = { id: string; site_url: string; registered_to_company?: boolean; health: WpHealthLevel; problems: WpProblem[]; facts: WpFacts }

export const HEALTH_COLOR: Record<WpHealthLevel, string> = { red: 'red', yellow: 'gold', green: 'green' }
export const HEALTH_LABEL: Record<WpHealthLevel, string> = { red: 'Needs action', yellow: 'Check', green: 'Healthy' }

export const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/** What the monitoring plugin last reported about a site: the problems found, then the facts. */
export default function WpSiteDetails({ wp }: { wp: Pick<WpSiteSummary, 'site_url' | 'facts' | 'registered_to_company'> & { problems: { level: string; text: string }[] } }) {
  const f = wp.facts
  return (
    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
      {wp.problems.length > 0 ? (
        <Space wrap>
          {wp.problems.map((p) => (
            <Tag key={p.text} color={p.level === 'red' ? 'red' : p.level === 'yellow' ? 'gold' : 'default'} style={{ margin: 0 }}>{p.text}</Tag>
          ))}
        </Space>
      ) : (
        <Text type="secondary">Nothing needs attention.</Text>
      )}
      <Descriptions size="small" column={{ xs: 1, md: 2, xl: 3 }} bordered>
        <Descriptions.Item label="WordPress">{f.wp_version ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="PHP">{f.php_version ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Updates pending">
          {f.core_update_available ? `Core${f.core_latest ? ` → ${f.core_latest}` : ''}, ` : ''}
          {f.plugin_updates} plugin{f.plugin_updates === 1 ? '' : 's'}, {f.theme_updates} theme{f.theme_updates === 1 ? '' : 's'}
        </Descriptions.Item>
        <Descriptions.Item label="SSL">
          {!f.ssl.https ? 'Not https' : f.ssl.error ? `Could not check (${f.ssl.error})` : f.ssl.expired ? 'Expired' : f.ssl.days_left !== null ? `${f.ssl.days_left} days left (${fmtDate(f.ssl.valid_to)})` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Last backup">
          {!f.backup.installed ? 'UpdraftPlus not installed' : `${fmtDate(f.backup.last_time)}${f.backup.last_success === false ? ' (failed)' : f.backup.last_success ? ' (ok)' : ''}`}
        </Descriptions.Item>
        <Descriptions.Item label="Failed logins (24h)">{f.failed_logins_24h ?? 'n/a (needs Wordfence)'}</Descriptions.Item>
        <Descriptions.Item label="Wordfence open issues">{!f.wordfence.active ? 'Not installed' : (f.wordfence.open_issues ?? '—')}</Descriptions.Item>
        <Descriptions.Item label="Last report">{fmtDate(f.last_seen_at)}</Descriptions.Item>
        <Descriptions.Item label="Registered address">{wp.site_url}</Descriptions.Item>
      </Descriptions>
      {wp.registered_to_company === false ? <Text type="secondary" style={{ fontSize: 12 }}>This site is matched by its address; it is not yet linked to this company.</Text> : null}
    </Space>
  )
}
