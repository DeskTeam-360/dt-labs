import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'

import { getMobileSession } from './_data'

export const metadata: Metadata = {
  title: 'DeskTeam360',
  description: 'Helpdesk ticketing',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DeskTeam360',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#7c3aed',
}

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await getMobileSession()
  if (!user) redirect('/login')

  return (
    <div style={{ margin: 0, background: '#0f1117', color: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100dvh' }}>
      {children}
    </div>
  )
}
