'use client'

import { ConfigProvider } from 'antd'

export default function AntdProvider({
  children,
}: {
  children: React.ReactNode
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
      {children}
    </ConfigProvider>
  )
}

