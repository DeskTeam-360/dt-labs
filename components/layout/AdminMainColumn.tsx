'use client'

import { Layout } from 'antd'
import type { CSSProperties, ReactNode } from 'react'

import GlobalAnnouncementBar from '@/components/layout/GlobalAnnouncementBar'
import TicketSearchNavbar from '@/components/layout/TicketSearchNavbar'

export type AdminMainColumnUser = {
  id: string
  role?: string | null
}

type Props = {
  collapsed: boolean
  user: AdminMainColumnUser
  children: ReactNode
  /** Merged into inner `Layout` style after defaults (can override `marginLeft`, etc.) */
  style?: CSSProperties
  /** No left inset (e.g. customer layout with top nav only) */
  noSidebarInset?: boolean
  /** Passed through to Ant `Layout` (e.g. `suppressHydrationWarning`) */
  layoutProps?: React.ComponentProps<typeof Layout>
}

export default function AdminMainColumn({
  collapsed,
  user,
  children,
  style,
  noSidebarInset,
  layoutProps,
}: Props) {
  const isCustomer = (user.role ?? '').toLowerCase() === 'customer'
  const layoutStyle: CSSProperties = {
    marginLeft: noSidebarInset ? 0 : collapsed ? 80 : 250,
    transition: 'margin-left 0.2s',
    background: 'var(--layout-bg)',
    minHeight: '100vh',
    ...style,
  }
  return (
    <Layout style={layoutStyle} {...layoutProps}>
      <GlobalAnnouncementBar />

      
      {typeof window !== 'undefined' && !window.location.pathname.startsWith('/settings') && (
        <TicketSearchNavbar savedFiltersUserId={!isCustomer ? user.id : undefined} />
      )}
 
      {children}
    </Layout>
  )
}
