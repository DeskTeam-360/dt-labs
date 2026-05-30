function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

/** Strip HTML for OpenAI prompts; keeps hyperlink URLs so AI can use them as references. */
export function stripHtmlForPrompt(html: string): string {
  let s = String(html || '')
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')

  s = s.replace(
    /<a\s+[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_, q1: string, q2: string, q3: string, inner: string) => {
      const href = (q1 || q2 || q3 || '').trim()
      const label = decodeBasicHtmlEntities(
        inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      )
      const url = decodeBasicHtmlEntities(href)
      if (!url) return label
      if (!label) return `Link: ${url}`
      if (label === url) return `Link: ${url}`
      return `${label} (link: ${url})`
    }
  )

  s = s.replace(
    /<img[^>]*\ssrc\s*=\s*["']([^"'<>]+)["'][^>]*>/gi,
    (_, src: string) => ` [image: ${decodeBasicHtmlEntities(src.trim())}] `
  )

  s = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  return decodeBasicHtmlEntities(s).replace(/\s+/g, ' ').trim()
}

export type SummarizeAnchorRequest =
  | { type: 'description' }
  | { type: 'comment'; commentId: string }

export type LocalizedSummarizeComment = {
  id: string
  isFocal: boolean
  author: string
  authorType: string
  visibility: string
  createdAt: string
  body: string
}

export type LocalizedSummarizeContext = {
  ticketTitle: string
  anchor: 'description' | 'comment'
  focalAuthor: string
  focalAuthorType: string
  ticketDescription?: string
  comments: LocalizedSummarizeComment[]
}

/** Slice ordered comments: focal + `before` above + `after` below. */
export function pickCommentWindow<T extends { id: string }>(
  ordered: T[],
  commentId: string,
  before = 3,
  after = 3
): { window: T[]; focalIndex: number } | null {
  const focalIndex = ordered.findIndex((c) => c.id === commentId)
  if (focalIndex < 0) return null
  const start = Math.max(0, focalIndex - before)
  const end = Math.min(ordered.length, focalIndex + after + 1)
  return { window: ordered.slice(start, end), focalIndex: focalIndex - start }
}

export function buildLocalizedSummarizePrompt(ctx: LocalizedSummarizeContext): string {
  const descriptionBlock =
    ctx.anchor === 'description'
      ? `Ticket description (focal):\n${(ctx.ticketDescription ?? '').slice(0, 8000) || '(empty)'}`
      : ''

  const commentsBlock =
    ctx.comments.length > 0
      ? ctx.comments
          .map((c, i) => {
            const focal = c.isFocal ? ' [FOCAL]' : ''
            return `[${i + 1}]${focal} ${c.createdAt} | ${c.author} (${c.authorType}, ${c.visibility})\n${c.body.slice(0, 4000)}`
          })
          .join('\n\n')
      : '(no comments in this excerpt)'

  const excerptIntro =
    ctx.anchor === 'description'
      ? 'Excerpt = ticket description + up to the 3 oldest comments by the focal author only (other authors are excluded).'
      : 'Excerpt = the focal comment plus up to 3 comments above and 3 below it (chronological).'

  return `You are summarizing a short excerpt of a support ticket for agents.

Ticket title: ${ctx.ticketTitle}
${excerptIntro}

${descriptionBlock ? `${descriptionBlock}\n\n` : ''}Comments in excerpt:
${commentsBlock}

Focal author (write the summary in their voice, first person where natural): ${ctx.focalAuthor} (${ctx.focalAuthorType})
Only summarize what this author contributed in the excerpt (their description and/or their comments). Ignore other authors' messages except as brief context.

Return JSON only: {"summary":["..."],"checklist":["..."]}

Write ALL output in English only.

"summary" — for internal comment / description (narrative recap):
- Use as many bullets as needed.
- Write in the focal author's voice (first person where natural): context, status, blockers, asks, and merged piecemeal ("nyicil") updates.
- When links appear in the excerpt (format: "text (link: https://...)"), mention important URLs as references in the recap.
- Each bullet is a clear prose point (not imperative commands); split topics but keep readable summary style.
- No markdown, no numbering inside strings.

"checklist" — for task checklist (commands only):
- Use as many items as needed for a full task breakdown.
- Each item = one actionable imperative command in English (verb first, e.g. "Update homepage banner", "Send draft to client for approval").
- When the excerpt includes links (shown as "link: https://..."), turn them into clear tasks and cite the URL in the command when it helps (e.g. "Review design at link: https://...").
- Split compound work into separate commands; no markdown, no numbering inside strings.
- Do not duplicate "summary" bullets verbatim — checklist is the actionable task list derived from the excerpt.`
}

/** @deprecated Full-thread prompt; kept for reference. Prefer buildLocalizedSummarizePrompt. */
export type CommentSummarizeContext = {
  ticketTitle: string
  ticketDescription: string
  ticketStatus: string
  checklistTitles: string[]
  comments: Array<{
    author: string
    visibility: string
    createdAt: string
    body: string
  }>
}

export function buildCommentSummarizePrompt(ctx: CommentSummarizeContext): string {
  const checklistBlock =
    ctx.checklistTitles.length > 0
      ? `Checklist:\n${ctx.checklistTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : 'Checklist: (empty)'

  const commentsBlock =
    ctx.comments.length > 0
      ? ctx.comments
          .map(
            (c, i) =>
              `[${i + 1}] ${c.createdAt} | ${c.author} (${c.visibility})\n${c.body.slice(0, 4000)}`
          )
          .join('\n\n')
      : '(no comments yet)'

  return `You are summarizing a support ticket thread for agents.

Ticket title: ${ctx.ticketTitle}
Status: ${ctx.ticketStatus}
Description: ${ctx.ticketDescription.slice(0, 8000) || '(empty)'}

${checklistBlock}

Comments (oldest to newest):
${commentsBlock}

Return a concise bullet summary as JSON only: {"items":["bullet 1","bullet 2",...]}
Rules:
- make sure the bullets are in the same language as the ticket/comments (prefer English if mixed).
- Each bullet is one clear action or fact (max 120 chars).
- No markdown, no numbering inside strings.
- Focus on status, blockers, customer asks, and next steps.`
}

export type AiSummarizeResult = {
  summary: string[]
  checklist: string[]
}

function normalizeSummaryStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((s) => s.length > 0)
}

export function parseAiSummarizeFromOpenAiContent(raw: string): AiSummarizeResult {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed
  try {
    const parsed = JSON.parse(jsonText) as {
      summary?: unknown
      checklist?: unknown
      items?: unknown
    }
    const summary = normalizeSummaryStringArray(parsed.summary ?? parsed.items)
    const checklist = normalizeSummaryStringArray(parsed.checklist)
    return { summary, checklist }
  } catch {
    const fallback = trimmed
      .split('\n')
      .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
      .filter((s) => s.length > 2)
    return { summary: fallback, checklist: [] }
  }
}

/** @deprecated Use parseAiSummarizeFromOpenAiContent */
export function parseSummaryItemsFromOpenAiContent(raw: string): string[] {
  return parseAiSummarizeFromOpenAiContent(raw).summary
}

export async function requestOpenAiLocalizedSummary(prompt: string): Promise<AiSummarizeResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 10000,
      messages: [
        {
          role: 'system',
          content: 'You output valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(errBody || `OpenAI request failed (${res.status})`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content ?? ''
  const result = parseAiSummarizeFromOpenAiContent(content)
  if (result.summary.length === 0 && result.checklist.length === 0) {
    throw new Error('AI returned an empty summary')
  }
  return result
}

/** @deprecated Use requestOpenAiLocalizedSummary */
export async function requestOpenAiCommentSummary(prompt: string): Promise<string[]> {
  const result = await requestOpenAiLocalizedSummary(prompt)
  return result.summary.length > 0 ? result.summary : result.checklist
}

const URL_IN_PLAIN_TEXT = /https?:\/\/[^\s<>"')]+/gi

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Turn bare http(s) URLs in plain text into clickable anchor tags (safe for rich HTML fields). */
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

export function parseSummarizeAnchorBody(body: unknown): SummarizeAnchorRequest {
  if (body && typeof body === 'object') {
    const o = body as { anchor?: string; commentId?: string }
    if (o.anchor === 'comment' && typeof o.commentId === 'string' && o.commentId.trim()) {
      return { type: 'comment', commentId: o.commentId.trim() }
    }
  }
  return { type: 'description' }
}
