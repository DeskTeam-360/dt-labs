'use client'

import { ConfigProvider } from 'antd'
import { SessionProvider } from 'next-auth/react'

export default function AntdProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
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

