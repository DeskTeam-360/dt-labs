'use client'

import { ConfigProvider } from 'antd'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'

export default function AntdProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session?: Session | null
}) {
  return (
    <SessionProvider
      session={session}
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#667eea',
            borderRadius: 8,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </SessionProvider>
  )
}

