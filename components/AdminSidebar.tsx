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
    FlagOutlined,
} from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { signOutAction } from '@/app/actions/auth'
import { SpaNavLink, shouldOpenHrefInNewTab } from '@/components/SpaNavLink'
import {
  canAccessCompanies,
  canAccessTickets,
  canAccessTicketAttributes,
  canAccessAutomationRules,
  canAccessTeams,
  canAccessEmailIntegration,
  canAccessKnowledgeBase,
  canAccessUsers,
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
function selectedKeysForPathname(pathname: string | null): string[] {
  if (!pathname) return []
  const topLevel = [
    '/dashboard',
    '/my-company',
    '/users',
    '/companies',
    '/tickets',
    '/teams',
    '/email-integration',
    '/knowledge-base',
  ]
  const top = topLevel.find((k) => pathname === k || (k !== '/dashboard' && pathname.startsWith(`${k}/`)))
  if (top) return [top]
  const ticketAttr = ['/ticket-statuses', '/ticket-types', '/ticket-priorities', '/tags', '/automation-rules']
  const sub = ticketAttr.find((k) => pathname === k || pathname.startsWith(`${k}/`))
  return sub ? [sub] : []
}

export default function AdminSidebar({ user, collapsed, onCollapse }: AdminSidebarProps) {
  const { data: session } = useSession()
  const sessionRole = (session?.user as { role?: string } | undefined)?.role
  const role = ((user.role ?? sessionRole) ?? '').toLowerCase()
  const isCustomer = role === 'customer'
  const router = useRouter()
  const pathname = usePathname()
  const [openKeys, setOpenKeys] = useState<string[]>([])

  // Set open keys after mount to avoid hydration mismatch
  useEffect(() => {
    if (pathname) {
      if (pathname.startsWith('/company-data-templates') || pathname.startsWith('/company-content-templates') || pathname.startsWith('/company-ai-system-templates')) {
        setOpenKeys(['templates'])
      } else if (
        (canAccessTicketAttributes(role) &&
          (pathname.startsWith('/ticket-statuses') ||
            pathname.startsWith('/ticket-types') ||
            pathname.startsWith('/ticket-priorities') ||
            pathname.startsWith('/tags'))) ||
        (canAccessAutomationRules(role) && pathname.startsWith('/automation-rules'))
      ) {
        setOpenKeys(['ticket-attributes'])
      } else if (pathname.startsWith('/content-planner')) {
        setOpenKeys(['content-planner'])
      }
    }
  }, [pathname, role])

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
    {
      key: '/users',
      icon: <TeamOutlined />,
      label: linkLabel('/users', 'Users'),
    },
    {
      key: '/companies',
      icon: <TeamOutlined />,
      label: linkLabel('/companies', 'Companies'),
    },
    {
      key: '/tickets',
      icon: <CheckSquareOutlined />,
      label: linkLabel('/tickets', 'Tickets'),
    },
    {
      key: 'ticket-attributes',
      icon: <SettingOutlined />,
      label: 'Ticket Attributes',
      popupClassName: 'admin-sidebar-ticket-attributes-popup',
      children: [
        { key: '/ticket-statuses', icon: <SettingOutlined />, label: linkLabel('/ticket-statuses', 'Ticket Statuses') },
        { key: '/ticket-types', icon: <AppstoreOutlined />, label: linkLabel('/ticket-types', 'Ticket Types') },
        { key: '/ticket-priorities', icon: <FlagOutlined />, label: linkLabel('/ticket-priorities', 'Ticket Priorities') },
        { key: '/tags', icon: <TagOutlined />, label: linkLabel('/tags', 'Tags') },
        ...(canAccessAutomationRules(role)
          ? [{ key: '/automation-rules', icon: <ThunderboltOutlined />, label: linkLabel('/automation-rules', 'Automation Rules') }]
          : []),
      ],
    },
    {
      key: '/teams',
      icon: <TeamOutlined />,
      label: linkLabel('/teams', 'Teams'),
    },
    {
      key: '/email-integration',
      icon: <MailOutlined />,
      label: linkLabel('/email-integration', 'Email Integration'),
    },
    {
      key: '/knowledge-base',
      icon: <InfoCircleOutlined />,
      label: linkLabel('/knowledge-base', 'Knowledge Base'),
    },
  ].filter((item) => {
    if (isCustomer) {
      return !['ticket-attributes', '/teams', '/email-integration', '/companies', '/knowledge-base', '/users'].includes(
        item.key as string
      )
    }
    // Role-based: Users, Company, Teams, Email Integration, Knowledge Base = Admin only; Tickets = Admin & Manager
    if (item.key === '/users' && !canAccessUsers(role)) return false
    if (item.key === '/companies' && !canAccessCompanies(role)) return false
    if (item.key === '/tickets' && !canAccessTickets(role)) return false
    if (item.key === '/teams' && !canAccessTeams(role)) return false
    if (item.key === '/email-integration' && !canAccessEmailIntegration(role)) return false
    if (item.key === '/knowledge-base' && !canAccessKnowledgeBase(role)) return false
    if (item.key === 'ticket-attributes' && !canAccessTicketAttributes(role)) return false
    return true
  })

  const selectedKeys = useMemo(() => selectedKeysForPathname(pathname), [pathname])

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
