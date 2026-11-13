'use client'

import { Alert } from 'antd'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'

/** For admins: a warning when open tickets are assigned to people who are no longer active. Shows nothing otherwise. */
export default function InactiveAssigneesBanner() {
  const role = ((useSession().data?.user as { role?: string } | undefined)?.role ?? '').toLowerCase()
  const allowed = role === 'admin' || role === 'operations'
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!allowed) return
    let live = true
    fetch('/api/tickets/inactive-assignees', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((j: { count?: number }) => {
        if (live) setCount(j.count ?? 0)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [allowed])

  if (!allowed || count === 0) return null
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      title={`${count} open ${count === 1 ? 'ticket is' : 'tickets are'} assigned to inactive people`}
      description={<SpaNavLink href="/settings/inactive-assignees">Review and hand them over</SpaNavLink>}
    />
  )
}
