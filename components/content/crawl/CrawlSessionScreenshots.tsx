'use client'

import { Button, Card, Divider, Empty, Flex, Image, InputNumber, message, Select, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'

const { Text } = Typography

type PageLite = { url: string; depth: number; status: string; http_status_code: number | null; content_type: string | null }
type Shot = { id: string; file_url: string; title: string | null; created_at: string; device: 'desktop' | 'mobile'; page_url: string }

const MAX_RANDOM = 10
const DEVICES: ('desktop' | 'mobile')[] = ['desktop', 'mobile']

const isHome = (p: PageLite) => {
  try {
    return p.depth === 0 || new URL(p.url).pathname === '/'
  } catch {
    return p.depth === 0
  }
}
/** Pages that opened fine and are real web pages: the ones worth a picture. */
const isCapturable = (p: PageLite) => p.status === 'completed' && (p.http_status_code ?? 200) < 400 && (!p.content_type || p.content_type.includes('html'))

/** Whole-page pictures, desktop and mobile, of a page of this crawl that you pick, or of random pages (never the homepage). */
export default function CrawlSessionScreenshots({ sessionId, pages }: { sessionId: string; pages: PageLite[] }) {
  const [shots, setShots] = useState<Shot[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [count, setCount] = useState(3)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/screenshots/capture?crawl_session_id=${sessionId}`, { credentials: 'include' })
    if (res.ok) setShots(((await res.json()) as { screenshots: Shot[] }).screenshots)
  }, [sessionId])
  useEffect(() => {
    void load()
  }, [load])

  const capturable = useMemo(() => pages.filter(isCapturable), [pages])
  const randomPool = useMemo(() => capturable.filter((p) => !isHome(p)), [capturable])

  /** One page at a time, desktop then mobile, so the progress shows and one slow page does not stop the others. */
  const run = async (urls: string[]) => {
    const total = urls.length * DEVICES.length
    setProgress({ done: 0, total })
    let failed = 0
    let done = 0
    for (const url of urls) {
      for (const device of DEVICES) {
        try {
          const res = await fetch('/api/screenshots/capture', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, device, full_page: true, crawl_session_id: sessionId }),
          })
          if (!res.ok) {
            failed++
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            if (res.status === 503) {
              message.error(j.error || 'The browser for captures is not available')
              setProgress(null)
              void load()
              return
            }
          }
        } catch {
          failed++
        }
        setProgress({ done: ++done, total })
        void load()
      }
    }
    setProgress(null)
    if (failed) message.warning(`${total - failed} of ${total} captured; ${failed} failed`)
    else message.success(`${total} pictures captured`)
  }

  const captureRandom = () => {
    const n = Math.min(count, randomPool.length)
    if (n === 0) return void message.info('No page besides the homepage to pick from')
    const shuffled = [...randomPool].sort(() => Math.random() - 0.5)
    void run(shuffled.slice(0, n).map((p) => p.url))
  }

  const groups = useMemo(() => {
    const m = new Map<string, Shot[]>()
    for (const s of shots) m.set(s.page_url, [...(m.get(s.page_url) ?? []), s])
    return [...m.entries()]
  }, [shots])
  const busy = progress !== null

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small" title="Capture pages of this crawl">
        <Flex vertical gap={12}>
          <Flex gap={8} wrap align="center">
            <Select
              showSearch
              allowClear
              placeholder="Pick a page"
              style={{ minWidth: 380, maxWidth: '100%' }}
              value={picked}
              onChange={setPicked}
              optionFilterProp="label"
              options={capturable.map((p) => ({ value: p.url, label: p.url }))}
              disabled={busy}
            />
            <Button type="primary" disabled={!picked || busy} onClick={() => picked && void run([picked])}>Capture this page</Button>
          </Flex>
          <Divider style={{ margin: 0 }}>or</Divider>
          <Flex gap={8} wrap align="center">
            <Text>Random pages:</Text>
            <InputNumber min={1} max={MAX_RANDOM} precision={0} value={count} onChange={(v) => setCount(v ?? 1)} disabled={busy} />
            <Button disabled={busy || randomPool.length === 0} onClick={captureRandom}>Capture random pages</Button>
            <Text type="secondary" style={{ fontSize: 12 }}>The homepage is never picked. {randomPool.length} page{randomPool.length === 1 ? '' : 's'} to pick from.</Text>
          </Flex>
          <Text type="secondary" style={{ fontSize: 12 }}>Every capture is the whole page, once on desktop and once on mobile. Each takes up to half a minute, so a few pages can take a few minutes.</Text>
          {progress ? <Text strong>Capturing {progress.done} of {progress.total}...</Text> : null}
        </Flex>
      </Card>

      {groups.length === 0 ? (
        <Empty description="No pictures yet" />
      ) : (
        groups.map(([url, list]) => (
          <Card key={url} size="small" title={<a href={url} target="_blank" rel="noopener noreferrer">{url}</a>} extra={<Text type="secondary">{dayjs(list[0].created_at).format('MMM D, HH:mm')}</Text>}>
            <Flex gap={16} wrap align="flex-start">
              {DEVICES.map((d) => {
                const s = list.find((x) => x.device === d)
                return (
                  <div key={d} style={{ width: d === 'mobile' ? 260 : 520 }}>
                    <Text strong style={{ textTransform: 'capitalize' }}>{d}</Text>
                    {s ? (
                      <div style={{ marginTop: 6, maxHeight: 460, overflow: 'auto', border: '1px solid var(--ant-color-border-secondary, #f0f0f0)' }}>
                        <Image src={s.file_url} alt={`${d} ${url}`} style={{ width: '100%' }} />
                      </div>
                    ) : (
                      <div><Text type="secondary">none</Text></div>
                    )}
                  </div>
                )
              })}
            </Flex>
          </Card>
        ))
      )}
    </Space>
  )
}
