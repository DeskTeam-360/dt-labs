'use client'

import Image from 'next/image'
import { Layout, Menu, Avatar, Dropdown, Typography } from 'antd'
import {
    DashboardOutlined,
    UserOutlined,
    LogoutOutlined,
    LockOutlined,
    HomeOutlined,
    InfoCircleOutlined,
    TeamOutlined,
    SettingOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    CheckSquareOutlined,
    TagOutlined,
    AppstoreOutlined,
    MailOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'

const { Sider } = Layout
const { Text } = Typography

const SIDEBAR_BG = '#2b1252'

interface SessionUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  user_metadata?: { full_name?: string | null; avatar_url?: string | null }
  role?: string
}

interface AdminSidebarProps {
  user: SessionUser
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}

export default function AdminSidebar({ user, collapsed, onCollapse }: AdminSidebarProps) {
  const isCustomer = (user.role ?? '').toLowerCase() === 'customer'
  const router = useRouter()
  const pathname = usePathname()
  const [openKeys, setOpenKeys] = useState<string[]>([])

  // Set open keys after mount to avoid hydration mismatch
  useEffect(() => {
    if (pathname) {
      if (pathname.startsWith('/company-data-templates') || pathname.startsWith('/company-content-templates') || pathname.startsWith('/company-ai-system-templates')) {
        setOpenKeys(['templates'])
      } else       if (pathname.startsWith('/ticket-statuses') || pathname.startsWith('/ticket-types') || pathname.startsWith('/tags') || pathname.startsWith('/automation-rules')) {
        setOpenKeys(['ticket-attributes'])
      } else if (pathname.startsWith('/content-planner')) {
        setOpenKeys(['content-planner'])
      }
    }
  }, [pathname])

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/users',
      icon: <TeamOutlined />,
      label: 'Users',
    },
    {
      key: '/companies',
      icon: <TeamOutlined />,
      label: 'Companies',
    },
    {
      key: '/tickets',
      icon: <CheckSquareOutlined />,
      label: 'Tickets',
    },
    {
      key: 'ticket-attributes',
      icon: <SettingOutlined />,
      label: 'Ticket Attributes',
      children: [
        {
          key: '/ticket-statuses',
          icon: <SettingOutlined />,
          label: 'Ticket Statuses',
        },
        {
          key: '/ticket-types',
          icon: <AppstoreOutlined />,
          label: 'Ticket Types',
        },
        {
          key: '/tags',
          icon: <TagOutlined />,
          label: 'Tags',
        },
        {
          key: '/automation-rules',
          icon: <ThunderboltOutlined />,
          label: 'Automation Rules',
        },
      ],
    },
    {
      key: '/teams',
      icon: <TeamOutlined />,
      label: 'Teams',
    },
    {
      key: '/email-integration',
      icon: <MailOutlined />,
      label: 'Email Integration',
    },
    {
      key: '/knowledge-base',
      icon: <InfoCircleOutlined />,
      label: 'Knowledge Base',
    },
  ].filter((item) => (isCustomer ? !['ticket-attributes', '/teams', '/email-integration', '/companies', '/knowledge-base'].includes(item.key) : true))

  // Determine which menu items should be selected (match parent routes: /tickets/2 -> /tickets)
  const selectedKeys = pathname
    ? [
        ['/dashboard', '/users', '/companies', '/tickets', '/teams', '/email-integration', '/knowledge-base'].find((k) =>
          pathname === k || (k !== '/dashboard' && pathname.startsWith(k + '/'))
        ) || pathname,
      ].filter(Boolean)
    : []

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
    router.push('/login')
    router.refresh()
  }

  const accountMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Edit Profile',
      onClick: () => router.push('/profile'),
    },
    {
      key: 'password',
      icon: <LockOutlined />,
      label: 'Change Password',
      onClick: () => router.push('/change-password'),
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
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={250}
      className="admin-sidebar-deskteam"
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        background: SIDEBAR_BG,
        paddingLeft: 5,
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0 16px' : '0 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image
              src="/deskteam360-logo-white%201.png"
              alt="DeskTeam360"
              height={36}
              width={1000}
              style={{ flexShrink: 0, objectFit: 'contain', width: '100%', height: '100%' }}
            />
            
          </div>
        )}
        <div
          onClick={() => onCollapse(!collapsed)}
          style={{
            cursor: 'pointer',
            color: '#fff',
            fontSize: 16,
          }}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>
      </div>

      <Menu
        theme="dark"
        mode="inline"
        className="admin-sidebar-menu"
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        items={menuItems}
        style={{
          borderRight: 0,
          marginTop: 16,
          background: 'transparent',
        }}
        onClick={({ key }) => {
          if (key && typeof key === 'string' && !key.startsWith('templates')) {
            router.push(key)
          }
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.15)',
          background: SIDEBAR_BG,
        }}
      >
        <Dropdown
          menu={{ items: accountMenuItems }}
          placement="topLeft"
          trigger={['click']}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
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
              src={user.image ?? user.user_metadata?.avatar_url}
              size={collapsed ? 'default' : 40}
            />
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text
                  strong
                  style={{
                    color: '#fff',
                    display: 'block',
                    fontSize: 14,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.name ?? user.user_metadata?.full_name ?? 'User'}
                </Text>
                <Text
                  style={{
                    color: 'rgba(255, 255, 255, 0.65)',
                    display: 'block',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.email}
                </Text>
              </div>
            )}
          </div>
        </Dropdown>
      </div>
    </Sider>
  )
}

