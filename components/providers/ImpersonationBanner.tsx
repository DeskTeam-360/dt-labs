'use client'

import { Button } from 'antd'
import dayjs from 'dayjs'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

const BAR_HEIGHT = 40

/** Shown on every page while an admin or manager looks at the app as a client: who, until when, and the way back. */
export default function ImpersonationBanner() {
  const { data: session, update } = useSession()
  const [busy, setBusy] = useState(false)
  const viewing = session?.impersonation

  useEffect(() => {
    if (!viewing) return
    const before = document.body.style.paddingTop
    document.body.style.paddingTop = `${BAR_HEIGHT}px`
    return () => {
      document.body.style.paddingTop = before
    }
  }, [viewing])

  if (!viewing) return null

  const exit = async () => {
    setBusy(true)
    await update({ exitImpersonation: true })
    window.location.href = '/dashboard'
  }

  return (
    <div
      role="status"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, height: BAR_HEIGHT, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#d46b08', color: '#fff', fontSize: 14 }}
    >
      <span>
        Viewing as <b>{session?.user?.name || session?.user?.email}</b> (client), read only. You are {viewing.by_name}.
        {viewing.expires_at ? ` Ends at ${dayjs(viewing.expires_at).format('HH:mm')}.` : ''}
      </span>
      <Button size="small" loading={busy} onClick={() => void exit()}>Exit</Button>
    </div>
  )
}
