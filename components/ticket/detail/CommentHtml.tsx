'use client'

import { memo, useState } from 'react'

import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'

interface CommentHtmlProps {
  html: string
  style?: React.CSSProperties
  className?: string
}

/**
 * Renders comment HTML and collapses quoted email history (blockquotes) behind a toggle,
 * similar to how Freshdesk/Gmail minimize previous email thread content.
 */
function CommentHtml({ html, style, className }: CommentHtmlProps) {
  const [showQuote, setShowQuote] = useState(false)

  const sanitized = sanitizeRichHtml(html)
    .replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '')  // remove <div><br></div>
    .replace(/(<br\s*\/?>(\s*)){2,}/gi, '<br>')            // collapse multiple <br> into one

  // Detect if there's any blockquote or known email-quote wrapper in the HTML
  const hasQuote = /<blockquote|<div[^>]+class="[^"]*(?:gmail_quote|yahoo_quoted|OutlookMessageHeader|divRplyFwdMsg)[^"]*"/i.test(sanitized)

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        .comment-collapsed-quote blockquote,
        .comment-collapsed-quote .gmail_quote,
        .comment-collapsed-quote .yahoo_quoted,
        .comment-collapsed-quote #divRplyFwdMsg,
        .comment-collapsed-quote #OutlookMessageHeader {
          display: none !important;
        }
        .comment-collapsed-quote .gmail_extra {
          display: none !important;
        }
        .comment-html {
          user-select: text !important;
        }
        .comment-html div {
          min-height: 0;
        }
        .comment-html div:empty,
        .comment-html div > br:only-child {
          display: none;
        }
        .comment-html p {
          margin: 0;
          line-height: 1.5;
        }
        .comment-html p + p {
          margin-top: 8px;
        }
        .comment-html *[style] {
          background-color: transparent !important;
          color: inherit !important;
          user-select: text !important;
        }
      `}</style>

      <div
        className={`ql-editor comment-html ${hasQuote && !showQuote ? 'comment-collapsed-quote' : ''} ${className ?? ''}`}
        style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14, border: 'none', ...style }}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />

      {hasQuote && (
        <button
          onClick={() => setShowQuote((v) => !v)}
          title={showQuote ? 'Hide email history' : 'Show email history'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
            padding: '2px 8px',
            fontSize: 12,
            color: 'var(--ant-color-text-secondary, #8c8c8c)',
            background: 'var(--ant-color-fill-tertiary, rgba(0,0,0,0.06))',
            border: '1px solid var(--ant-color-border, #d9d9d9)',
            borderRadius: 4,
            cursor: 'pointer',
            lineHeight: '20px',
          }}
        >
          <span style={{ letterSpacing: 2, fontSize: 10, fontWeight: 700 }}>•••</span>
          {showQuote ? ' Hide history' : ' Show history'}
        </button>
      )}
    </div>
  )
}

export default memo(CommentHtml)
