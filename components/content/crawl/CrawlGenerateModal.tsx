'use client'

import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Flex, Input, message, Modal, Space, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import {
  buildGroups,
  type CrawlPageLite,
  downloadTextFile,
  generateRobotsTxt,
  generateSitemapXml,
  looksPrivate,
  originOf,
} from '@/lib/crawl-groups'

const { Text } = Typography

/** Builds sitemap.xml or robots.txt from the crawl, lets the person adjust it, then downloads it. Nothing is stored. */
export default function CrawlGenerateModal({
  kind,
  open,
  onClose,
  pages,
  websiteUrl,
}: {
  kind: 'sitemap' | 'robots'
  open: boolean
  onClose: () => void
  pages: CrawlPageLite[]
  websiteUrl?: string
}) {
  const groups = useMemo(() => buildGroups(pages), [pages])
  const origin = useMemo(() => originOf(pages, websiteUrl), [pages, websiteUrl])

  // sitemap options
  const [included, setIncluded] = useState<string[]>([])
  const [skipQuery, setSkipQuery] = useState(true)
  const [skipNoindex, setSkipNoindex] = useState(true)
  const [addLastmod, setAddLastmod] = useState(true)
  const [addPriority, setAddPriority] = useState(false)
  // robots options
  const [blocked, setBlocked] = useState<string[]>([])
  const [extra, setExtra] = useState('')
  const [withSitemap, setWithSitemap] = useState(true)
  // the text itself can be edited by hand
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)

  useEffect(() => {
    if (!open) return
    setIncluded(groups.filter((g) => !looksPrivate(g)).map((g) => g.key))
    setBlocked(groups.filter((g) => looksPrivate(g)).map((g) => g.key))
    setEdited(false)
  }, [open, groups])

  const generated = useMemo(() => {
    if (kind === 'sitemap') return generateSitemapXml(pages, { groups: included, skipQuery, skipNoindex, addLastmod, addPriority })
    return { xml: generateRobotsTxt({ origin, blocked, extraDisallow: extra, sitemap: withSitemap }), count: blocked.length }
  }, [kind, pages, included, skipQuery, skipNoindex, addLastmod, addPriority, origin, blocked, extra, withSitemap])

  useEffect(() => {
    if (!edited) setText(generated.xml)
  }, [generated, edited])

  const filename = kind === 'sitemap' ? 'sitemap.xml' : 'robots.txt'
  const mime = kind === 'sitemap' ? 'application/xml' : 'text/plain'

  return (
    <Modal
      title={kind === 'sitemap' ? 'Generate sitemap.xml' : 'Generate robots.txt'}
      open={open}
      onCancel={onClose}
      width={820}
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button
            icon={<CopyOutlined />}
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => message.success('Copied'))
            }}
          >
            Copy
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => downloadTextFile(filename, text, mime)}>
            Download {filename}
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <Flex vertical gap={12}>
        {kind === 'sitemap' ? (
          <>
            <div>
              <Text strong>Groups to include</Text>
              <div style={{ marginTop: 4 }}>
                <Checkbox.Group
                  value={included}
                  onChange={(v) => {
                    setIncluded(v as string[])
                    setEdited(false)
                  }}
                  options={groups.map((g) => ({ value: g.key, label: `${g.label} (${g.ok})` }))}
                />
              </div>
            </div>
            <Flex gap={16} wrap>
              <Checkbox checked={skipQuery} onChange={(e) => { setSkipQuery(e.target.checked); setEdited(false) }}>Skip URLs with ? parameters</Checkbox>
              <Checkbox checked={skipNoindex} onChange={(e) => { setSkipNoindex(e.target.checked); setEdited(false) }}>Skip pages marked noindex</Checkbox>
              <Checkbox checked={addLastmod} onChange={(e) => { setAddLastmod(e.target.checked); setEdited(false) }}>Add lastmod (crawl date)</Checkbox>
              <Checkbox checked={addPriority} onChange={(e) => { setAddPriority(e.target.checked); setEdited(false) }}>Add priority by depth</Checkbox>
            </Flex>
            <Text type="secondary">
              Only pages that loaded fine as HTML are listed (broken, failed and non-HTML pages are left out). {generated.count} URL(s) right now.
            </Text>
          </>
        ) : (
          <>
            <div>
              <Text strong>Groups to block (Disallow)</Text>
              <div style={{ marginTop: 4 }}>
                <Checkbox.Group
                  value={blocked}
                  onChange={(v) => {
                    setBlocked(v as string[])
                    setEdited(false)
                  }}
                  options={groups.filter((g) => g.key !== '/').map((g) => ({ value: g.key, label: `${g.prefix} (${g.pages.length})` }))}
                />
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Groups that look private (admin, login, cart, checkout, account, search) are ticked for you. Untick anything that should stay on Google.
              </Text>
            </div>
            <div>
              <Text strong>Other paths to block (one per line)</Text>
              <Input.TextArea
                rows={2}
                value={extra}
                placeholder={'/private/\n/*?replytocom='}
                onChange={(e) => {
                  setExtra(e.target.value)
                  setEdited(false)
                }}
              />
            </div>
            <Checkbox checked={withSitemap} onChange={(e) => { setWithSitemap(e.target.checked); setEdited(false) }}>
              Add the Sitemap line ({origin ? `${origin}/sitemap.xml` : 'site address unknown'})
            </Checkbox>
            <Alert
              type="warning"
              showIcon
              title="Check it before you upload"
              description="A wrong Disallow line can make good pages disappear from Google. This is a starting point built from what the crawl found, not a replacement for a review."
            />
          </>
        )}

        <div>
          <Flex justify="space-between" align="center">
            <Text strong>Preview (you can edit it)</Text>
            {edited ? (
              <Button type="link" size="small" onClick={() => setEdited(false)}>Reset to generated</Button>
            ) : null}
          </Flex>
          <Input.TextArea
            rows={12}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setEdited(true)
            }}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 }}
          />
        </div>
      </Flex>
    </Modal>
  )
}
