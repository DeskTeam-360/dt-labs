'use client'

import { useMemo, useState, useEffect } from 'react'
import { Layout, Avatar, Dropdown, Typography, Menu, Flex } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
  HomeOutlined,
  AppstoreOutlined,
  InfoCircleOutlined,
  TeamOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  GlobalOutlined,
  DatabaseOutlined,
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { SpaNavLink, shouldOpenHrefInNewTab } from '@/components/SpaNavLink'

const { Header } = Layout
const { Text } = Typography

interface CustomerNavbarProps {
  user: { id: string; email?: string | null; name?: string | null; image?: string | null }
}

const PORTAL_TITLE = 'Deskteam360 Portal'

export default function CustomerNavbar({ user }: CustomerNavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const selectedKeys = useMemo(() => {
    if (!mounted || !pathname) return []
    if (pathname === '/customer') return ['dashboard']
    if (pathname.startsWith('/customer/info')) return ['info']
    if (pathname.startsWith('/customer/users')) return ['users']
    if (pathname.startsWith('/customer/tickets')) return ['tickets']
    if (pathname.startsWith('/customer/content-planner')) return ['content-planner']
    if (pathname.startsWith('/customer/data-form')) return ['data-form']
    if (pathname.startsWith('/customer/generate')) return ['generate']
    if (pathname.startsWith('/customer/knowledge-base')) return ['knowledge-base']
    if (pathname.startsWith('/customer/websites')) return ['websites']
    if (pathname.startsWith('/customer/crawling')) return ['crawling']
    return []
  }, [pathname, mounted])

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const accountMenuItems = [
    {
      key: 'profile',
      label: (
        <SpaNavLink
          href="/profile"
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}
        >
          <UserOutlined />
          Edit Profile
        </SpaNavLink>
      ),
    },
    {
      key: 'password',
      label: (
        <SpaNavLink
          href="/change-password"
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}
        >
          <LockOutlined />
          Change Password
        </SpaNavLink>
      ),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: handleLogout,
    },
  ]

  return (
    <Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: '#001529',
        height: 64,
        minHeight: 64,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
        }}
        onClick={() => router.push('/customer')}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppstoreOutlined style={{ fontSize: 22, color: '#fff' }} />
        </div>
        <Text strong style={{ color: '#fff', fontSize: 18 }}>
          {PORTAL_TITLE}
        </Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Menu
          mode="horizontal"
          theme="dark"
          selectedKeys={selectedKeys}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            lineHeight: '64px',
            width: '100%',
          }}
          items={[
            { key: 'dashboard', icon: <HomeOutlined />, label: 'Dashboard' },
            { key: 'info', icon: <InfoCircleOutlined />, label: 'Info' },
            { key: 'users', icon: <TeamOutlined />, label: 'Users' },
            { key: 'tickets', icon: <CheckSquareOutlined />, label: 'Tickets' },
            { key: 'data-form', icon: <DatabaseOutlined />, label: 'Company Data' },
            { key: 'content-planner', icon: <FileTextOutlined />, label: 'Content Planner' },
            { key: 'websites', icon: <GlobalOutlined />, label: 'Websites' },
            { key: 'crawling', icon: <GlobalOutlined />, label: 'Crawling' },
          ]}
          onClick={({ key, domEvent }) => {
            const pathMap: Record<string, string> = {
              dashboard: '/customer',
              info: '/customer/info',
              users: '/customer/users',
              tickets: '/customer/tickets',
              'data-form': '/customer/data-form',
              'content-planner': '/customer/content-planner',
              websites: '/customer/websites',
              crawling: '/customer/crawling',
            }
            const path = pathMap[key as string]
            if (path) {
              if (shouldOpenHrefInNewTab(domEvent)) {
                window.open(path, '_blank', 'noopener,noreferrer')
              } else if (!('button' in domEvent) || domEvent.button === 0) {
                router.push(path)
              }
            }
          }}
        />

        <Dropdown
          menu={{ items: accountMenuItems }}
          placement="bottomRight"
          trigger={['click']}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 8,
              transition: 'background 0.3s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Avatar
              icon={<UserOutlined />}
              src={user?.image ?? undefined}
              size={36}
            />
            <Flex vertical gap={0} style={{ lineHeight: 1, color: '#fff' }}>
                <strong>{user?.name || 'User'}</strong>
              
                {user?.email}
              
            </Flex>
          </div>
        </Dropdown>
      </div>
    </Header>
  )
}
