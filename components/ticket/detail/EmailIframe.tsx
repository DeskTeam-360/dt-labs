'use client'

import { memo, useEffect, useRef, useState } from 'react'

import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'

interface EmailIframeProps {
  html: string
  className?: string
}

/**
 * Renders untrusted email HTML inside a sandboxed iframe so the app's
 * global CSS (Ant Design, Quill, etc.) cannot bleed in and corrupt email
 * layout (buttons, images, tables, etc.).
 */
function EmailIframe({ html, className }: EmailIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)

  const sanitized = sanitizeRichHtml(html)

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1f1f; background: transparent; }
  img { max-width: 100%; height: auto; }
  a { color: #1677ff; }
  p { margin: 0 0 8px; }
  p:last-child { margin-bottom: 0; }
  blockquote { border-left: 3px solid #d9d9d9; margin: 8px 0 8px 12px; padding-left: 12px; color: #666; }
  table { border-collapse: collapse; max-width: 100%; }
  td, th { padding: 4px 8px; }
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
