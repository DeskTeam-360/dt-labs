'use client'

import { App, ConfigProvider, theme } from 'antd'
import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'

import FirebaseSessionBridge from '@/components/FirebaseSessionBridge'
import NotificationPollProvider from '@/components/NotificationPollProvider'
import SessionAccessGuard from '@/components/SessionAccessGuard'
import { ThemeProvider, useTheme } from '@/components/ThemeProvider'

function ThemedConfig({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#667eea',
          borderRadius: 8,
          ...(isDark
            ? {
                colorBgElevated: '#1f1f1f',
                colorBgContainer: '#141414',
              }
            : {}),
        },
        /** Sidebar always uses `theme="dark"` menu; global darkAlgorithm was forcing white text on the light pill. */
        components: {
          Menu: {
            darkItemSelectedBg: '#f0f2f5',
            darkItemSelectedColor: '#141414',
          },
          Table: isDark
            ? {
                headerBg: '#1a1a1a',
                headerColor: 'rgba(255, 255, 255, 0.88)',
                borderColor: '#303030',
                headerSplitColor: 'rgba(255, 255, 255, 0.12)',
                rowHoverBg: 'rgba(255, 255, 255, 0.04)',
                headerBorderRadius: 8,
              }
            : {
                headerBg: '#fafafa',
                headerColor: 'rgba(0, 0, 0, 0.88)',
                borderColor: '#f0f0f0',
                headerSplitColor: '#f0f0f0',
                rowHoverBg: '#f5f8ff',
                headerBorderRadius: 8,
              },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  )
}

export default function AntdProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session?: Session | null
}) {
  return (
    <ThemeProvider>
      <ThemedConfig>
        {/* NextAuth: no polling + no focus refetch — avoids heavy /api/auth/session traffic. */}
        <SessionProvider session={session} refetchInterval={0} refetchOnWindowFocus={false}>
          <NotificationPollProvider>
            <SessionAccessGuard />
            <FirebaseSessionBridge />
            {children}
          </NotificationPollProvider>
        </SessionProvider>
      </ThemedConfig>
    </ThemeProvider>
  )
}
