'use client'

import { Button, message, Space, Tag, Typography } from 'antd'
import { useState } from 'react'

import WpSiteDetails, { HEALTH_COLOR, HEALTH_LABEL, type WpSiteSummary } from '@/components/wp-monitor/WpSiteDetails'

/** What the WordPress monitor knows about the crawled website: its health, problems and facts, with a Check now button. */
export default function CrawlSessionWordPress({ wp, crawlId, snapshotAt, onChanged }: { wp: WpSiteSummary; crawlId: string; snapshotAt: string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(snapshotAt)

  const checkNow = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/wp-monitor/sites/${wp.id}/check`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawl_session_id: crawlId }),
      })
      const j = (await res.json().catch(() => ({}))) as { uptime_ok?: boolean; report?: string; report_note?: string | null; error?: string }
      if (!res.ok) throw new Error(j.error || 'The check failed')
      const note = j.report === 'fresh' ? 'fresh report received' : `kept the last report (${j.report_note ?? 'no answer'})`
      message[j.uptime_ok ? 'success' : 'warning'](`${j.uptime_ok ? 'The site answers' : 'The site does not answer'}; ${note}`, 6)
      setSavedAt(new Date().toISOString())
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
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {savedAt ? `Kept with this crawl: ${new Date(savedAt).toLocaleString()}. A maintenance report from this crawl uses it.` : 'Not kept with this crawl yet. Check now saves it here.'}
        </Typography.Text>
      </Space>
      <WpSiteDetails wp={wp} />
    </div>
  )
}
