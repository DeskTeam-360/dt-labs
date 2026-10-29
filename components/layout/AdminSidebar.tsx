'use client'

import {
  AuditOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ContainerOutlined,
  DashboardOutlined,
  DeleteOutlined,
  EditOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  FundOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ProfileOutlined,
  ReadOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Badge, Layout, Menu } from 'antd'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'

import { shouldOpenHrefInNewTab,SpaNavLink } from '@/components/common/SpaNavLink'
import {
  canAccessTickets,
  isSettingsHrefPathname,
} from '@/lib/auth-utils'
import { applyMenuPreferences, type MenuPreferences, SIDEBAR_SECTIONS, sidebarItemsForRole } from '@/lib/sidebar-menu'

const { Sider } = Layout

const SIDEBAR_BG = '#2b1252'

const MENU_ICONS: Record<string, React.ReactNode> = {
  '/my-tickets': <UserOutlined />,
  '/dashboard': <DashboardOutlined />,
  '/tickets': <CheckSquareOutlined />,
  '/tickets/latest': <ClockCircleOutlined />,
  '/team-pool': <TeamOutlined />,
  '/calendar': <CalendarOutlined />,
  '/reference': <ReadOutlined />,
  '/tickets?ticket_type=spam': <WarningOutlined />,
  '/tickets?ticket_type=trash': <DeleteOutlined />,
  '/my-teams': <TeamOutlined />,
  '/team-report': <BarChartOutlined />,
  '/reports': <FundOutlined />,
  '/settings/team-availability': <FieldTimeOutlined />,
  '/pool-report': <ContainerOutlined />,
  '/customer-time-report': <ProfileOutlined />,
  '/settings/customer-weekly-recap': <ScheduleOutlined />,
  '/new-customer-report': <FileSearchOutlined />,
  '/settings/company-log': <HistoryOutlined />,
  '/settings/recap-snapshots': <AuditOutlined />,
  '/settings': <SettingOutlined />,
}

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
  if (pathname === '/tickets/latest') return ['/tickets/latest']
  if (pathname === '/reference' || pathname.startsWith('/reference/')) return ['/reference']
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return ['/projects']
  const settingsReports = ['/settings/team-availability', '/settings/customer-weekly-recap', '/settings/company-log', '/settings/recap-snapshots']
  const settingsReport = settingsReports.find((k) => pathname === k || pathname.startsWith(`${k}/`))
  if (settingsReport) return [settingsReport]
  if (isSettingsHrefPathname(pathname)) return ['/settings']
  const topLevel = ['/dashboard', '/my-tickets', '/my-teams', '/team-report', '/team-pool', '/calendar', '/pool-report', '/customer-time-report', '/new-customer-report', '/reports']
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
  const [appName, setAppName] = useState<string>(process.env.NEXT_PUBLIC_APP_NAME ?? 'DeskTeam360')
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null)
  const [menuPrefs, setMenuPrefs] = useState<MenuPreferences | null>(null)
  const [myTicketCount, setMyTicketCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/app-settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.app_name) setAppName(d.app_name)
        setAppLogoUrl(d.app_logo_url ?? null)
      })
      .catch(() => {})
  }, [])

  // Staff can reorder and hide items (My menu); customers keep the fixed menu.
  useEffect(() => {
    if (!role || isCustomer) return
    fetch('/api/menu-preferences', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: MenuPreferences | null) => setMenuPrefs(p))
      .catch(() => setMenuPrefs(null))
  }, [role, isCustomer])

  // Badge on My Tickets: how many assigned tickets still need work.
  useEffect(() => {
    if (!role || isCustomer) return
    const load = () =>
      fetch('/api/tickets/my-count', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { count?: number } | null) => setMyTicketCount(j?.count ?? null))
        .catch(() => {})
    void load()
    const t = setInterval(load, 120000)
    return () => clearInterval(t)
  }, [role, isCustomer, pathname])

  const linkLabel = (path: string, text: string) => (
    <SpaNavLink href={path} title={text} className="admin-sidebar-menu-link" onClick={(e) => e.stopPropagation()}>
      {text}
    </SpaNavLink>
  )

  // Customers keep a fixed menu.
  const customerMenuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: linkLabel('/dashboard', 'Dashboard') },
    ...(canAccessTickets(role) ? [{ key: '/tickets', icon: <CheckSquareOutlined />, label: linkLabel('/tickets', 'Tickets') }] : []),
    { key: '/reference', icon: <ReadOutlined />, label: linkLabel('/reference', 'Reference') },
  ]

  // Staff menu: one catalog (lib/sidebar-menu) decides what each role sees, grouped in sections, then the person's own order and hidden items apply.
  const staffFlat = sidebarItemsForRole(role).map((i) => ({
    key: i.key,
    icon: MENU_ICONS[i.key],
    label: i.key === '/my-tickets' && myTicketCount ? (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {linkLabel(i.key, i.label)}
        <Badge count={myTicketCount} overflowCount={99} size="small" color="#fa8c16" />
      </span>
    ) : (
      linkLabel(i.key, i.label)
    ),
    section: i.section,
  }))
  const staffOrdered = menuPrefs ? applyMenuPreferences(staffFlat, menuPrefs) : staffFlat
  const staffMenuItems = SIDEBAR_SECTIONS.map((sec) => ({
    type: 'group' as const,
    key: `group-${sec.key}`,
    label: sec.label,
    children: staffOrdered.filter((i) => i.section === sec.key).map((i) => ({ key: i.key, icon: i.icon, label: i.label })),
  })).filter((g) => g.children.length > 0)

  const menuItems = isCustomer ? customerMenuItems : staffMenuItems

  const selectedKeys = useMemo(
    () => selectedKeysForPathname(pathname, pathname?.startsWith('/tickets') ? ticketsListSearch : ''),
    [pathname, ticketsListSearch]
  )

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={250}
      className="admin-sidebar-deskteam deskteam-app-sidebar"
      style={{
        overflow: 'hidden',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        height: undefined,
        minHeight: '100dvh',
        background: SIDEBAR_BG,
        paddingLeft: 5,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          margin: '0 20px',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0 16px' : '0 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          gap: 8,
        }}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
            {appLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={appLogoUrl}
                alt={appName}
                style={{ flexShrink: 0, objectFit: 'contain', width: '100%', height: 36, maxHeight: 36 }}
              />
            ) : (
              <Image
                src="/deskteam360-logo-white%201.png"
                alt={appName}
                height={36}
                width={1000}
                style={{ flexShrink: 0, objectFit: 'contain', width: '100%', height: '100%' }}
              />
            )}
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

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
            marginBottom: 24,
            background: 'transparent',
          }}
          onClick={({ key, domEvent }) => {
            if (
              key &&
              typeof key === 'string' &&
              key.startsWith('/') &&
              !(domEvent.target as HTMLElement)?.closest('a')
            ) {
              if (shouldOpenHrefInNewTab(domEvent)) {
                window.open(key, '_blank', 'noopener,noreferrer')
              } else if (!('button' in domEvent) || domEvent.button === 0) {
                router.push(key)
              }
            }
          }}
        />
      </div>

      {!isCustomer && !collapsed ? (
        <SpaNavLink href="/my-menu" title="Customize menu" className="admin-sidebar-menu-link" style={{ display: 'block', padding: '12px 24px', color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
          <EditOutlined /> Customize menu
        </SpaNavLink>
      ) : null}
    </Sider>
  )
}
