import DOMPurify, { type Config } from 'isomorphic-dompurify'

/**
 * HTML untuk ditampilkan di detail tiket (deskripsi + komentar, termasuk dari email).
 * - Menghapus script / tag dokumen yang merusak layout
 * - Pada tabel: hilangkan lebar paksa (style width & atribut width) supaya muat kontainer
 * - Sel td/th yang benar-benar kosong: sembunyikan agar tidak menambah ruang kosong besar
 */
const RICH_HTML_CONFIG: Config = {
  USE_PROFILES: { html: true },
  /** data-list: Quill v2 lists; start: merged sibling <ol> continuation */
  ADD_ATTR: ['target', 'data-list', 'start'],
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'form'],
}

const TABLE_LAYOUT_TAGS = new Set([
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TD',
  'TH',
  'COL',
  'COLGROUP',
])

function stripWidthFromStyle(style: string | null | undefined): string {
  if (style == null || !String(style).trim()) return ''
  return String(style)
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !/^(width|min-width|max-width)\s*:/i.test(p))
    .join('; ')
}

function appendStyle(existing: string | null, add: string): string {
  const e = (existing || '').trim().replace(/;?\s*$/, '')
  const a = add.trim()
  if (!e) return a
  if (!a) return e
  return `${e}; ${a}`
}

function isCellVisuallyEmpty(node: Element): boolean {
  if (
    node.querySelector(
      'img, picture, svg, video, audio, iframe, object, a[href], input, button, select, textarea',
    )
  ) {
    return false
  }
  const text = (node.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\s\u200b\uFEFF]/g, '')
    .trim()
  return text.length === 0
}

type AttrHookEvent = {
  attrName?: string
  attrValue?: string
  keepAttr?: boolean
}

let ticketRichHtmlHooksInstalled = false

function installTicketRichHtmlHooks(): void {
  if (ticketRichHtmlHooksInstalled) return
  ticketRichHtmlHooksInstalled = true

  DOMPurify.addHook('uponSanitizeAttribute', (node, data: AttrHookEvent) => {
    const tag = node.nodeName
    if (!TABLE_LAYOUT_TAGS.has(tag)) return

    if (data.attrName === 'style' && typeof data.attrValue === 'string') {
      const next = stripWidthFromStyle(data.attrValue)
      data.attrValue = next
      if (!next.trim()) data.keepAttr = false
      return
    }

    if (data.attrName === 'width') {
      data.keepAttr = false
    }
  })

  DOMPurify.addHook('afterSanitizeElements', (node) => {
    if (node.nodeType !== 1) return
    const el = node as Element
    if (el.nodeName !== 'TD' && el.nodeName !== 'TH') return
    if (!isCellVisuallyEmpty(el)) return
    const prev = el.getAttribute('style')
    el.setAttribute(
      'style',
      appendStyle(
        prev,
        'display:none;padding:0;border:none;margin:0;line-height:0;overflow:hidden;max-width:0',
      ),
    )
  })
}

/** <ol> tanpa li[data-list] (HTML semantik / export Quill): penomoran browser selalu mulai 1 per <ol>. */
function isSemanticOrderedList(el: Element): boolean {
  if (el.nodeName !== 'OL') return false
  return el.querySelector(':scope > li[data-list]') == null
}

/**
 * Satu checklist sering jadi beberapa <ol> beturut-turut yang dipisah <ul>.
 * Tanpa ini, tiap <ol> tampil 1. 1. 1. — kita set atribut `start` untuk melanjutkan angka.
 */
function mergeSiblingOrderedListStarts(container: ParentNode): void {
  let nextIndex = 0
  let prev: Element | null = null

  for (const child of Array.from(container.children)) {
    /* JSDOM / Node: hindari `instanceof Element` (global tidak selalu ada). */
    const el = child as Element
    if (el.nodeName === 'OL') {
      if (!isSemanticOrderedList(el)) {
        nextIndex = 0
        prev = el
        continue
      }

      const continueList =
        prev != null &&
        (prev.nodeName === 'OL' || prev.nodeName === 'UL') &&
        (prev.nodeName !== 'OL' || isSemanticOrderedList(prev))

      if (!continueList) {
        nextIndex = 0
      }

      const n = el.querySelectorAll(':scope > li').length

      if (nextIndex === 0) {
        el.removeAttribute('start')
        nextIndex = n
      } else {
        el.setAttribute('start', String(nextIndex + 1))
        nextIndex += n
      }
      prev = el
      continue
    }

    prev = el
  }
}

export function sanitizeRichHtml(html: string | null | undefined): string {
  installTicketRichHtmlHooks()
  if (html == null || typeof html !== 'string') return '<p></p>'
  const t = html.trim()
  if (!t) return '<p></p>'

  const frag = DOMPurify.sanitize(t, {
    ...RICH_HTML_CONFIG,
    RETURN_DOM_FRAGMENT: true,
  }) as unknown as DocumentFragment

  if (frag?.ownerDocument && frag.childNodes.length > 0) {
    mergeSiblingOrderedListStarts(frag)
    const holder = frag.ownerDocument.createElement('div')
    holder.append(...Array.from(frag.childNodes))
    return String(DOMPurify.sanitize(holder.innerHTML, RICH_HTML_CONFIG))
  }

  return String(DOMPurify.sanitize(t, RICH_HTML_CONFIG))
}
