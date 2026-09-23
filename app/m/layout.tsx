import '../globals.css?v=1.0.1'

import type { Metadata, Viewport } from 'next'

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

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f1117', color: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100dvh' }}>
        {children}
      </body>
    </html>
  )
}
