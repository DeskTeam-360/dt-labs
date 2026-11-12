'use client'

import { Button, message, Space, Tag, Typography } from 'antd'
import { useState } from 'react'

import WpSiteDetails, { HEALTH_COLOR, HEALTH_LABEL, type WpSiteSummary } from '@/components/wp-monitor/WpSiteDetails'

/** What the WordPress monitor knows about the crawled website: its health, problems and facts, with a Check now button. */
export default function CrawlSessionWordPress({ wp, onChanged }: { wp: WpSiteSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)

  const checkNow = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/wp-monitor/sites/${wp.id}/check`, { method: 'POST', credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as { uptime_ok?: boolean; report?: string; report_note?: string | null; error?: string }
      if (!res.ok) throw new Error(j.error || 'The check failed')
      const note = j.report === 'fresh' ? 'fresh report received' : `kept the last report (${j.report_note ?? 'no answer'})`
      message[j.uptime_ok ? 'success' : 'warning'](`${j.uptime_ok ? 'The site answers' : 'The site does not answer'}; ${note}`, 6)
      onChanged()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Tag color={HEALTH_COLOR[wp.health]} style={{ margin: 0 }}>{HEALTH_LABEL[wp.health]}</Tag>
        <Typography.Text type="secondary">{wp.site_url}</Typography.Text>
        <Button size="small" loading={busy} onClick={checkNow}>Check now</Button>
      </Space>
      <WpSiteDetails wp={wp} />
    </div>
  )
}
