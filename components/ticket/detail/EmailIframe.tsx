'use client'

import DOMPurify from 'isomorphic-dompurify'
import { memo, useEffect, useRef, useState } from 'react'

interface EmailIframeProps {
  html: string
  className?: string
}

/** Sanitize email HTML permissively — keep <style>, <table>, inline styles intact. */
function sanitizeEmail(html: string): string {
  return String(
    DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: [
        'target',
        'class',
        'style',
        'width',
        'height',
        'align',
        'valign',
        'bgcolor',
        'background',
        'cellpadding',
        'cellspacing',
        'border',
        'color',
        'face',
        'size',
        'hspace',
        'vspace',
        'nowrap',
        'role',
      ],
      ADD_TAGS: ['style', 'center', 'font'],
      FORBID_TAGS: ['script', 'object', 'embed', 'base', 'form', 'input', 'button', 'textarea', 'select'],
      FORCE_BODY: true,
    })
  )
}

const QUOTE_SELECTORS = [
  'blockquote',
  '.gmail_quote',
  '.gmail_quote_container',
  '.gmail_extra',
  '.yahoo_quoted',
  '#divRplyFwdMsg',
  '#OutlookMessageHeader',
]

export function emailHtmlHasQuote(html: string): boolean {
  return /<blockquote|class="[^"]*(?:gmail_quote|yahoo_quoted)[^"]*"|id="(?:divRplyFwdMsg|OutlookMessageHeader)"/i.test(html)
}

/**
 * Renders untrusted email HTML inside a sandboxed iframe so the app's
 * global CSS (Ant Design, Quill, etc.) cannot bleed in and corrupt email
 * layout (buttons, images, tables, etc.).
 *
 * Host CSS is intentionally minimal — newsletter HTML relies on its own
 * <style>, table widths, spacer cells, and inline styles.
 */
function EmailIframe({ html, className }: EmailIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  const [showQuote, setShowQuote] = useState(false)

  const sanitized = sanitizeEmail(html)
  const hasQuote = emailHtmlHasQuote(sanitized)

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    overflow-x: auto;
    word-wrap: break-word;
    -webkit-text-size-adjust: 100%;
  }
  ${QUOTE_SELECTORS.map((sel) => `body.collapsed-quote ${sel}`).join(', ')} {
    display: none !important;
  }
</style>
</head>
<body class="${hasQuote && !showQuote ? 'collapsed-quote' : ''}">${sanitized}</body>
</html>`

  const measure = () => {
    try {
      const body = iframeRef.current?.contentDocument?.body
      if (body) setHeight(Math.max(40, body.scrollHeight + 8))
    } catch { /* cross-origin guard */ }
  }

  // Toggle without reloading the iframe so scroll position and loaded images are kept.
  useEffect(() => {
    const body = iframeRef.current?.contentDocument?.body
    if (!body) return
    body.classList.toggle('collapsed-quote', hasQuote && !showQuote)
    measure()
  }, [showQuote, hasQuote])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const blob = new Blob([doc], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    iframe.src = url

    const onLoad = () => {
      measure()
      URL.revokeObjectURL(url)
    }

    iframe.addEventListener('load', onLoad)
    return () => {
      iframe.removeEventListener('load', onLoad)
      URL.revokeObjectURL(url)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html])

  return (
    <>
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height,
        border: 'none',
        background: 'transparent',
        overflow: 'hidden',
        userSelect: 'text',
      }}
      title="email-content"
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
    </>
  )
}

export default memo(EmailIframe)
