'use client'

import { EyeOutlined } from '@ant-design/icons'
import { Button, message, Popconfirm, Tooltip } from 'antd'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

/** Admin and manager only, and only for clients: see the app the way this client sees it (read only, one hour). */
export function canViewAs(viewerRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  return ['admin', 'manager'].includes((viewerRole ?? '').toLowerCase()) && (targetRole ?? '').toLowerCase() === 'customer'
}

export default function ViewAsButton({ userId, userName, iconOnly = false }: { userId: string; userName?: string | null; iconOnly?: boolean }) {
  const { update } = useSession()
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    try {
      await update({ impersonate: userId })
      // A full load, so every page starts again with the client's identity.
      window.location.href = '/dashboard'
    } catch {
      message.error('Could not switch to this client')
      setBusy(false)
    }
  }

  return (
    <Popconfirm
      title={`View as ${userName || 'this client'}?`}
      description="You will see the app the way they see it. It is read only, nothing can be changed, it is noted in the activity log, and it ends by itself after an hour."
      okText="View as client"
      onConfirm={() => void start()}
    >
      <Tooltip title="View as this client (read only)">
        <Button icon={<EyeOutlined />} loading={busy}>{iconOnly ? null : 'View as client'}</Button>
      </Tooltip>
    </Popconfirm>
  )
}
