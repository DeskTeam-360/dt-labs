/** Pure client-safe utilities extracted from ticket-comment-summarize.ts (no DB/server imports). */

const URL_IN_PLAIN_TEXT = /https?:\/\/[^\s<>"')]+/gi

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function linkifyPlainTextForHtml(text: string): string {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (/<a\s[^>]*href\s*=/i.test(raw)) return raw

  return escapeHtmlText(raw).replace(URL_IN_PLAIN_TEXT, (url) => {
    const href = url.replace(/&quot;/g, '"')
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`
  })
}

export function linkifyAiOutputItems(items: string[]): string[] {
  return items.map((t) => linkifyPlainTextForHtml(t))
}

export function summaryItemsToCommentHtml(items: string[]): string {
  const lis = linkifyAiOutputItems(items).map((t) => `<li>${t}</li>`).join('')
  return `<p><strong>AI Summary</strong></p><ul>${lis}</ul>`
}
