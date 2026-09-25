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

  const sanitized = sanitizeEmail(html)

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
</style>
</head>
<body>${sanitized}</body>
</html>`

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const blob = new Blob([doc], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    iframe.src = url

    const onLoad = () => {
      try {
        const body = iframe.contentDocument?.body
        if (body) setHeight(Math.max(40, body.scrollHeight + 8))
      } catch { /* cross-origin guard */ }
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
  )
}

export default memo(EmailIframe)
