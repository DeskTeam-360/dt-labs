import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { chromium } from 'playwright-core'

const NAVIGATION_TIMEOUT_MS = 30000
const MAX_CONCURRENT = 2
const MAX_WAITING = 8
const MAX_FULL_PAGE_HEIGHT = 15000

const IMAGE_WAIT_MS = 15000
/** Shows what scroll-reveal scripts keep hidden until you scroll, and ends animations at once. */
const REVEAL_CSS = `
*, *::before, *::after { animation-duration: 0.001s !important; animation-delay: 0s !important; transition-duration: 0.001s !important; transition-delay: 0s !important; scroll-behavior: auto !important; }
[data-aos], .aos-init, .aos-animate, .wow, .elementor-invisible, .reveal { opacity: 1 !important; transform: none !important; visibility: visible !important; }
`

/** Runs in the page: turns lazy images into normal ones (data-src and friends become src). */
function makeImagesEager() {
  const copy = (el: Element, from: string, to: string) => {
    const v = el.getAttribute(from)
    if (v) el.setAttribute(to, v)
  }
  document.querySelectorAll('img').forEach((img) => {
    img.loading = 'eager'
    const src = img.getAttribute('src') ?? ''
    if (!src || src.startsWith('data:')) {
      for (const a of ['data-src', 'data-lazy-src', 'data-original', 'data-lazy']) {
        if (img.getAttribute(a)) {
          copy(img, a, 'src')
          break
        }
      }
    }
    for (const a of ['data-srcset', 'data-lazy-srcset']) if (img.getAttribute(a)) copy(img, a, 'srcset')
  })
  document.querySelectorAll('source').forEach((s) => {
    copy(s, 'data-srcset', 'srcset')
    copy(s, 'data-src', 'src')
  })
}

/** Runs in the page: scrolls down in small steps so sections that load on scroll get their turn. */
async function scrollThrough(cap: number) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const step = Math.max(200, Math.round(window.innerHeight * 0.6))
  for (let y = 0; y < Math.min(document.documentElement.scrollHeight, cap); y += step) {
    window.scrollTo(0, y)
    await sleep(250)
  }
  window.scrollTo(0, Math.min(document.documentElement.scrollHeight, cap))
  await sleep(500)
}

/** Runs in the page: waits until every image has loaded or failed; returns how many did not load. */
async function waitForImages(maxMs: number): Promise<number> {
  const deadline = Date.now() + maxMs
  const real = () => Array.from(document.images).filter((i) => (i.currentSrc || i.src) && !(i.currentSrc || i.src).startsWith('data:'))
  while (Date.now() < deadline && real().some((i) => !i.complete)) await new Promise((r) => setTimeout(r, 300))
  await Promise.all(real().map((i) => (i.complete && i.naturalWidth > 0 ? i.decode().catch(() => undefined) : undefined)))
  return real().filter((i) => !i.complete || (i.naturalWidth === 0 && !/\.svg(\?|$)/i.test(i.currentSrc || i.src))).length
}

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
export async function assertPublicUrl(raw: string): Promise<URL> {
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
export function captureWebsite(rawUrl: string, opts: CaptureOptions = {}): Promise<{ png: Buffer; finalUrl: string; title: string; unloadedImages: number }> {
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
        reducedMotion: 'reduce',
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

      // Make sure everything is there before the picture: scroll-reveal sections are shown, lazy images are fetched,
      // and every image has finished loading (or has failed, which is counted and reported).
      await page.addStyleTag({ content: REVEAL_CSS }).catch(() => undefined)
      await page.evaluate(makeImagesEager).catch(() => undefined)
      if (opts.fullPage) {
        await page.evaluate(scrollThrough, MAX_FULL_PAGE_HEIGHT).catch(() => undefined)
        await page.evaluate(makeImagesEager).catch(() => undefined)
      }
      const unloadedImages = await page.evaluate(waitForImages, IMAGE_WAIT_MS).catch(() => 0)
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined)
      await page.waitForTimeout(500)

      let png: Buffer
      if (opts.fullPage) {
        const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0))
        const width = page.viewportSize()?.width ?? 1366
        // A very tall page is cut at the limit instead of falling back to the top screen only.
        png = await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width, height: Math.max(1, Math.min(height, MAX_FULL_PAGE_HEIGHT)) } })
      } else {
        png = await page.screenshot({ type: 'png' })
      }
      return { png, finalUrl: page.url(), title: (await page.title().catch(() => '')) || first.hostname, unloadedImages }
    } finally {
      await browser.close().catch(() => undefined)
    }
  })
}
