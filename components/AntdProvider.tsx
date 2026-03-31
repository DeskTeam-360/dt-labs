'use client'

import { App, ConfigProvider } from 'antd'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import FirebaseSessionBridge from '@/components/FirebaseSessionBridge'

export default function AntdProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session?: Session | null
}) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#667eea',
          borderRadius: 8,
        },
      }}
    >
      <App>
        <SessionProvider
          session={session}
          refetchInterval={0}
          refetchOnWindowFocus={false}
        >
          <FirebaseSessionBridge />
          {children}
        </SessionProvider>
      </App>
    </ConfigProvider>
  )
}

