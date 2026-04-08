'use client'

import { Tooltip } from 'antd'
import { SpaNavLink } from '@/components/SpaNavLink'
import type { ReactNode } from 'react'

type TicketUserMentionProps = {
  userId?: string | null
  email?: string | null
  children: ReactNode
  className?: string
}

/**
 * Hover: email. Click: profile /settings/users/[id] (when userId present).
 */
export default function TicketUserMention({ userId, email, children, className }: TicketUserMentionProps) {
  const tip = email?.trim() ? email.trim() : 'Email tidak tersedia'
  const body =
    userId ? (
      <SpaNavLink
        href={`/settings/users/${userId}`}
        className={className}
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        {children}
      </SpaNavLink>
    ) : (
      <span className={className}>{children}</span>
    )
  return <Tooltip title={tip}>{body}</Tooltip>
}
