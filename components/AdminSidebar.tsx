'use client'

import { Layout, Menu, Avatar, Dropdown, Typography, Space } from 'antd'
import {
  DashboardOutlined,
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DatabaseOutlined,
  FormOutlined,
  GlobalOutlined,
  CheckSquareOutlined,
  PictureOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { useState, useEffect } from 'react'

const { Sider } = Layout
const { Text } = Typography

interface AdminSidebarProps {
  user: User
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}

export default function AdminSidebar({ user, collapsed, onCollapse }: AdminSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [openKeys, setOpenKeys] = useState<string[]>([])

  // Set open keys after mount to avoid hydration mismatch
  useEffect(() => {
    if (pathname && (pathname.startsWith('/company-data-templates') || pathname.startsWith('/company-content-templates') || pathname.startsWith('/company-ai-system-templates'))) {
      setOpenKeys(['templates'])
    }
  }, [pathname])

  // Determine which menu items should be selected
  const selectedKeys = pathname ? [pathname] : []

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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
      key: '/todos',
      icon: <CheckSquareOutlined />,
      label: 'Todos',
    },
    {
      key: '/todo-statuses',
      icon: <SettingOutlined />,
      label: 'Todo Statuses',
    },
    {
      key: '/screenshots',
      icon: <PictureOutlined />,
      label: 'Screenshots',
    },
    {
      key: '/teams',
      icon: <TeamOutlined />,
      label: 'Teams',
    },
    {
      key: 'templates',
      icon: <FormOutlined />,
      label: 'Templates',
      children: [
        {
          key: '/company-data-templates',
          icon: <DatabaseOutlined />,
          label: 'Data Templates',
        },
        {
          key: '/company-content-templates',
          icon: <FileTextOutlined />,
          label: 'Content Templates',
        },
        {
          key: '/company-ai-system-templates',
          icon: <RobotOutlined />,
          label: 'AI System Templates',
        },
      ],
    },
    {
      key: '/crawl-sessions',
      icon: <GlobalOutlined />,
      label: 'Crawling',
    },
    // {
    //   key: '/settings',
    //   icon: <SettingOutlined />,
    //   label: 'Settings',
    // },
  ]

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
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        background: '#001529',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0 16px' : '0 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DashboardOutlined style={{ fontSize: 24, color: '#667eea' }} />
            <Text strong style={{ color: '#fff', fontSize: 16 }}>
              {process.env.NEXT_PUBLIC_APP_NAME}
            </Text>
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
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        items={menuItems}
        style={{ borderRight: 0, marginTop: 8 }}
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
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          background: '#001529',
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
              src={user.user_metadata?.avatar_url}
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
                  {user.user_metadata?.full_name || 'User'}
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

