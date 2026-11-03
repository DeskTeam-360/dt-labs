'use client'

import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Flex, message, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'

const { Text } = Typography

type Shot = { id: string; file_url: string; created_at: string; device: 'desktop' | 'mobile'; page_url: string }
type PageLite = { url: string; depth: number }

const isHome = (url: string, pages: PageLite[]) => {
  const page = pages.find((p) => p.url === url)
  if (page) return page.depth === 0
  try {
    return new URL(url).pathname === '/'
  } catch {
    return false
  }
}

/** The pictures of this crawl as a numbered list for the Overview: the homepage first, then the inner pages, each with its image links. */
export default function CrawlSessionScreenshotLinks({ sessionId, pages }: { sessionId: string; pages: PageLite[] }) {
  const [shots, setShots] = useState<Shot[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/screenshots/capture?crawl_session_id=${sessionId}`, { credentials: 'include' })
      if (res.ok) setShots(((await res.json()) as { screenshots: Shot[] }).screenshots)
    } finally {
      setLoading(false)
    }
  }, [sessionId])
  useEffect(() => {
    void load()
  }, [load])

  const items = useMemo(() => {
    const byPage = new Map<string, Shot[]>()
    for (const s of [...shots].reverse()) byPage.set(s.page_url, [...(byPage.get(s.page_url) ?? []), s])
    const list = [...byPage.entries()].map(([url, list]) => {
      // The newest picture of each device is the one that counts.
      const newest = (d: 'desktop' | 'mobile') => [...list].reverse().find((x) => x.device === d)
      return { url, home: isHome(url, pages), desktop: newest('desktop'), mobile: newest('mobile') }
    })
    return [...list.filter((x) => x.home), ...list.filter((x) => !x.home)].map((x, i) => ({ ...x, n: i + 1, label: x.home ? 'Homepage' : 'Inner page' }))
  }, [shots, pages])

  const copyAll = () => {
    const text = items
      .map((x) => [`${x.n}. ${x.label}: ${x.url}`, x.desktop ? `   Desktop image: ${x.desktop.file_url}` : null, x.mobile ? `   Mobile image: ${x.mobile.file_url}` : null].filter(Boolean).join('\n'))
      .join('\n')
    navigator.clipboard.writeText(text).then(
      () => message.success('List copied'),
      () => message.error('Could not copy the list')
    )
  }

  if (items.length === 0) {
    return (
      <Flex align="center" gap={8} wrap>
        <Text type="secondary">No pictures yet. They appear here when the crawl was started with screenshots, or after you take them in the Screenshots tab.</Text>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Refresh</Button>
      </Flex>
    )
  }

  return (
    <Flex vertical gap={8}>
      <Space>
        <Button size="small" icon={<CopyOutlined />} onClick={copyAll}>Copy list</Button>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Refresh</Button>
      </Space>
      {items.map((x) => (
        <div key={x.url}>
          <Text strong>{x.n}. {x.label}: </Text>
          <a href={x.url} target="_blank" rel="noopener noreferrer">{x.url}</a>
          <div style={{ paddingLeft: 20 }}>
            {x.desktop ? <a href={x.desktop.file_url} target="_blank" rel="noopener noreferrer">Desktop image</a> : <Text type="secondary">Desktop image: none</Text>}
            <Text type="secondary"> · </Text>
            {x.mobile ? <a href={x.mobile.file_url} target="_blank" rel="noopener noreferrer">Mobile image</a> : <Text type="secondary">Mobile image: none</Text>}
          </div>
        </div>
      ))}
    </Flex>
  )
}
