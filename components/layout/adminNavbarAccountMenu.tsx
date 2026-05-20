'use client'

import { LockOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'

import { SpaNavLink } from '@/components/common/SpaNavLink'

/** Shared dropdown: profile, change password, logout (Staff sidebar footer + TicketSearchNavbar). */
export function adminNavbarAccountMenuItems(onLogout: () => Promise<void>): MenuProps['items'] {
  return [
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
      onClick: () => {
        void onLogout()
      },
    },
  ]
}
