/** Shared types for ticket AI summarize — no server/DB imports, safe for client components. */

export type SummarizeAnchorRequest =
  | { type: 'description' }
  | { type: 'ticket' }
  | { type: 'comment'; commentId: string }

export type AiSummarizeResult = {
  summary: string[]
  checklist: string[]
}

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
  anchor: 'description' | 'ticket' | 'comment'
  focalAuthor: string
  focalAuthorType: string
  ticketDescription?: string
  comments: LocalizedSummarizeComment[]
}
