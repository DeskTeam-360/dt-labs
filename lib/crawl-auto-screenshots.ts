import { eq } from 'drizzle-orm'

import { crawlPages, crawlSessions, db } from '@/lib/db'
import { captureAndSave } from '@/lib/web-capture-store'

const DEVICES: ('desktop' | 'mobile')[] = ['desktop', 'mobile']

type PageLite = { url: string; depth: number | null; status: string | null; httpStatusCode: number | null; contentType: string | null }

export const isHomePage = (p: { url: string; depth: number | null }) => {
  try {
    return p.depth === 0 || new URL(p.url).pathname === '/'
  } catch {
    return p.depth === 0
  }
}
/** Pages that opened fine and are real web pages: the ones worth a picture. */
export const isCapturablePage = (p: PageLite) => p.status === 'completed' && (p.httpStatusCode ?? 200) < 400 && (!p.contentType || p.contentType.includes('html'))

/**
 * When a crawl that was asked to finish with pictures is done: the homepage and/or some random inner pages (never the homepage twice),
 * whole page, desktop and mobile, saved under the name of whoever started the crawl. A page that fails is skipped, the rest go on.
 * Returns how many pictures were taken.
 */
export async function captureAfterCrawl(sessionId: string): Promise<number> {
  const [session] = await db.select().from(crawlSessions).where(eq(crawlSessions.id, sessionId)).limit(1)
  if (!session || !session.startedBy || (!session.screenshotHomepage && session.screenshotRandomCount <= 0)) return 0

  const pages = (await db.select().from(crawlPages).where(eq(crawlPages.crawlSessionId, sessionId))) as PageLite[]
  const usable = pages.filter(isCapturablePage)
  const home = usable.filter(isHomePage).sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))[0]
  const inner = usable.filter((p) => !isHomePage(p))
  const pick = [...inner].sort(() => Math.random() - 0.5).slice(0, session.screenshotRandomCount)
  const urls = [...(session.screenshotHomepage && home ? [home.url] : []), ...pick.map((p) => p.url)]

  let taken = 0
  for (const url of urls) {
    for (const device of DEVICES) {
      try {
        await captureAndSave({ userId: session.startedBy, url, device, fullPage: true, crawlSessionId: sessionId })
        taken++
      } catch (e) {
        console.error(`[Crawl] screenshot of ${url} (${device}) failed:`, (e as Error).message)
      }
    }
  }
  console.log(`[Crawl] Session ${sessionId}: ${taken} screenshot(s) taken after the crawl`)
  return taken
}
