import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { chromium } from 'playwright-core'

const NAVIGATION_TIMEOUT_MS = 30000
const MAX_CONCURRENT = 2
const MAX_WAITING = 8
const MAX_FULL_PAGE_HEIGHT = 15000

export type CaptureOptions = { device?: 'desktop' | 'mobile'; fullPage?: boolean; waitSeconds?: number }
export class CaptureError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** True for addresses that are not on the public internet: this machine, private networks, link-local (cloud metadata), carrier NAT. */
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true
  const mapped = v.startsWith('::ffff:') ? v.slice(7) : v
  const p = mapped.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return !mapped.includes('.') && mapped.includes(':') ? false : true
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

/** Only http(s) addresses whose name resolves to public IPs only. Throws CaptureError otherwise. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new CaptureError('That is not a valid web address')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new CaptureError('Only http and https addresses can be captured')
  if (u.username || u.password) throw new CaptureError('Addresses with a login inside are not allowed')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new CaptureError('Internal addresses cannot be captured')
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address)
  if (ips.length === 0) throw new CaptureError('That address could not be found')
  if (ips.some(isPrivateIp)) throw new CaptureError('Internal addresses cannot be captured')
  return u
}

// Only a few captures run at once (a browser needs memory); the rest wait their turn, and too many waiting are turned away.
let running = 0
const waiting: (() => void)[] = []
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    if (waiting.length >= MAX_WAITING) throw new CaptureError('Too many captures are waiting. Try again in a minute.', 429)
    await new Promise<void>((resolve) => waiting.push(resolve))
  } else {
    running++
  }
  try {
    return await work()
  } finally {
    const next = waiting.shift()
    if (next) next()
    else running--
  }
}

/** A PNG of the page at `rawUrl`, taken by a headless Chromium on this server. */
export function captureWebsite(rawUrl: string, opts: CaptureOptions = {}): Promise<{ png: Buffer; finalUrl: string; title: string }> {
  return slot(async () => {
    const first = await assertPublicUrl(rawUrl)
    const mobile = opts.device === 'mobile'
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }).catch(() => {
      throw new CaptureError('The browser for captures is not installed on the server (on the server, as the user that runs the app, in the project folder: npx playwright-core install chromium; as root first: npx playwright-core install-deps chromium)', 503)
    })
    try {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
        userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined,
        isMobile: mobile,
        deviceScaleFactor: 1,
        acceptDownloads: false,
        serviceWorkers: 'block',
      })
      // Redirects and the page's own requests are held to the same rule, so a public page cannot lead the browser into the internal network.
      const okHosts = new Set<string>([first.hostname])
      await context.route('**/*', async (route) => {
        const u = new URL(route.request().url())
        if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return route.continue()
        try {
          if (!okHosts.has(u.hostname)) {
            await assertPublicUrl(u.toString())
            okHosts.add(u.hostname)
          }
          return route.continue()
        } catch {
          return route.abort('blockedbyclient')
        }
      })
      const page = await context.newPage()
      await page.goto(first.toString(), { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS }).catch((e: Error) => {
        throw new CaptureError(`The page could not be opened: ${e.message.split('\n')[0]}`, 502)
      })
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined)
      await page.waitForTimeout(Math.min(15, Math.max(0, opts.waitSeconds ?? 1)) * 1000)

      let png: Buffer
      if (opts.fullPage) {
        // Scroll down once so images that load as you scroll are there, then back to the top.
        await page.evaluate(async (cap: number) => {
          const step = Math.max(300, window.innerHeight)
          for (let y = 0; y < Math.min(document.documentElement.scrollHeight, cap); y += step) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 120))
          }
          window.scrollTo(0, 0)
        }, MAX_FULL_PAGE_HEIGHT)
        await page.waitForTimeout(300)
        const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0))
        const width = page.viewportSize()?.width ?? 1366
        // A very tall page is cut at the limit instead of falling back to the top screen only.
        png = await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width, height: Math.max(1, Math.min(height, MAX_FULL_PAGE_HEIGHT)) } })
      } else {
        png = await page.screenshot({ type: 'png' })
      }
      return { png, finalUrl: page.url(), title: (await page.title().catch(() => '')) || first.hostname }
    } finally {
      await browser.close().catch(() => undefined)
    }
  })
}
