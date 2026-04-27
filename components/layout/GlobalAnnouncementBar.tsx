'use client'

import { useEffect, useState } from 'react'

export default function GlobalAnnouncementBar() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/global-announcement', { credentials: 'include' })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { active?: boolean; message?: string }
        if (data.active && typeof data.message === 'string' && data.message.trim()) {
          setMessage(data.message.trim())
        } else {
          setMessage(null)
        }
      } catch {
        if (!cancelled) setMessage(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!message) return null

  const sep = '  \u2022  '
  const chunk = `${message}${sep}`

  return (
    <div className="global-announcement-bar" role="status" aria-live="polite">
      <div className="global-announcement-track">
        <span className="global-announcement-text">{chunk}</span>
        <span className="global-announcement-text" aria-hidden>
          {chunk}
        </span>
      </div>
    </div>
  )
}
