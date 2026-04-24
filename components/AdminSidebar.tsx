'use client'

import {
  BarChartOutlined,
    CheckSquareOutlined,
    DashboardOutlined,
    DeleteOutlined,
    HomeOutlined,
    InfoCircleOutlined,
    LockOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
  ReadOutlined,
    SettingOutlined,
  TeamOutlined,
    UserOutlined,
    WarningOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Avatar, Dropdown, Layout, Menu, Typography } from 'antd'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useMemo, useState } from 'react'

import { signOutAction } from '@/app/actions/auth'
import { shouldOpenHrefInNewTab,SpaNavLink } from '@/components/SpaNavLink'
import {
  canAccessCustomerTimeReport,
  canAccessMyTeams,
  canAccessSettingsHub,
  canAccessTickets,
  isSettingsHrefPathname,
} from '@/lib/auth-utils'

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

/** Paths that map to a Menu item key (avoid selectedKeys pointing at missing items, e.g. /profile). */
function selectedKeysForPathname(pathname: string | null, ticketsSearch: string): string[] {
  if (!pathname) return []
  if (pathname === '/tickets' || pathname === '/tickets/') {
    const qs = ticketsSearch.trim()
    const sp = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs)
    const tt = sp.get('ticket_type')?.toLowerCase()
    if (tt === 'spam') return ['/tickets?ticket_type=spam']
    if (tt === 'trash') return ['/tickets?ticket_type=trash']
    return ['/tickets']
  }
  if (pathname === '/reference' || pathname.startsWith('/reference/')) return ['/reference']
  if (isSettingsHrefPathname(pathname)) return ['/settings']
  const topLevel = ['/dashboard', '/my-company', '/my-teams', '/customer-time-report']
  const top = topLevel.find((k) => pathname === k || (k !== '/dashboard' && pathname.startsWith(`${k}/`)))
  if (top) return [top]
  const ticketsDetail = pathname.startsWith('/tickets/')
  if (ticketsDetail) return ['/tickets']
  return []
}

export default function AdminSidebar({ user, collapsed, onCollapse }: AdminSidebarProps) {
  const { data: session } = useSession()
  const sessionRole = (session?.user as { role?: string } | undefined)?.role
  const role = ((user.role ?? sessionRole) ?? '').toLowerCase()
  const isCustomer = role === 'customer'
  const router = useRouter()
  const pathname = usePathname()
  const ticketsListSearch = useSearchParams().toString()
  const [openKeys, setOpenKeys] = useState<string[]>([])

  const linkLabel = (path: string, text: string) => (
    <SpaNavLink href={path} title={text} className="admin-sidebar-menu-link" onClick={(e) => e.stopPropagation()}>
      {text}
    </SpaNavLink>
  )

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: linkLabel('/dashboard', 'Dashboard'),
    },
    ...(isCustomer
      ? [
          {
            key: '/my-company',
            icon: <InfoCircleOutlined />,
            label: linkLabel('/my-company', 'Company info'),
          },
        ]
      : []),
    ...(canAccessTickets(role)
      ? [
          ...(isCustomer
            ? [
                {
                  key: '/tickets',
                  icon: <CheckSquareOutlined />,
                  label: linkLabel('/tickets', 'Tickets'),
                },
              ]
            : [
                {
                  key: '/tickets',
                  icon: <CheckSquareOutlined />,
                  label: linkLabel('/tickets', 'All tickets'),
                },
                {
                  key: '/tickets?ticket_type=spam',
                  icon: <WarningOutlined />,
                  label: linkLabel('/tickets?ticket_type=spam', 'Spam'),
                },
                {
                  key: '/tickets?ticket_type=trash',
                  icon: <DeleteOutlined />,
                  label: linkLabel('/tickets?ticket_type=trash', 'Trash'),
                },
              ]),
          {
            key: '/reference',
            icon: <ReadOutlined />,
            label: linkLabel('/reference', 'Reference'),
          },
          ...(canAccessMyTeams(role)
            ? [
                {
                  key: '/my-teams',
                  icon: <TeamOutlined />,
                  label: linkLabel('/my-teams', 'My Teams'),
                },
              ]
            : []),
          ...(canAccessCustomerTimeReport(role)
            ? [
                {
                  key: '/customer-time-report',
                  icon: <BarChartOutlined />,
                  label: linkLabel('/customer-time-report', 'C Report'),
                },
              ]
            : []),
        ]
      : []),
    ...(canAccessSettingsHub(role)
      ? [
          {
            key: '/settings',
            icon: <SettingOutlined />,
            label: linkLabel('/settings', 'Settings'),
          },
        ]
      : []),
  ].filter((item) => {
    if (isCustomer) {
      return item.key !== '/settings'
    }
    const ticketMenuKeys = ['/tickets', '/tickets?ticket_type=spam', '/tickets?ticket_type=trash']
    if (ticketMenuKeys.includes(item.key as string) && !canAccessTickets(role)) return false
    if (item.key === '/settings' && !canAccessSettingsHub(role)) return false
    return true
  })

  const selectedKeys = useMemo(
    () => selectedKeysForPathname(pathname, pathname?.startsWith('/tickets') ? ticketsListSearch : ''),
    [pathname, ticketsListSearch]
  )

  const handleLogout = async () => {
    await signOutAction()
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
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={250}
      className="admin-sidebar-deskteam deskteam-app-sidebar"
      style={{
        overflow: 'hidden',
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
          gap: 8,
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            <Image
              src="/deskteam360-logo-white%201.png"
              alt="DeskTeam360"
              height={36}
              width={1000}
              style={{ flexShrink: 0, objectFit: 'contain', width: '100%', height: '100%' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
        onClick={({ key, domEvent }) => {
          if (key && typeof key === 'string' && key.startsWith('/') && !(domEvent.target as HTMLElement)?.closest('a')) {
            if (shouldOpenHrefInNewTab(domEvent)) {
              window.open(key, '_blank', 'noopener,noreferrer')
            } else if (!('button' in domEvent) || domEvent.button === 0) {
              router.push(key)
            }
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
              src={session?.user?.image ?? user.image ?? user.user_metadata?.avatar_url}
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
                  {session?.user?.name ?? user.name ?? user.user_metadata?.full_name ?? 'User'}
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
