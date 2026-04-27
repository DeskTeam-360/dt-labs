'use client'

import { BulbOutlined, CheckOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { DropdownProps, MenuProps } from 'antd'
import { Button, Dropdown } from 'antd'
import type { CSSProperties } from 'react'

import { useTheme } from '@/components/providers/ThemeProvider'

type ThemeToggleProps = {
  /** 'ticketNav' = same chrome as bell/history (CSS vars). 'ghostOnDark' = light icon on purple sidebar. */
  variant?: 'default' | 'ghostOnDark' | 'ticketNav'
  size?: 'small' | 'middle'
  placement?: DropdownProps['placement']
}

const ticketNavButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--ticket-nav-icon-btn-border)',
  borderRadius: 8,
  background: 'var(--ticket-nav-icon-btn-bg)',
  color: 'var(--ticket-nav-icon-btn-color)',
}

export default function ThemeToggle({
  variant = 'default',
  size = 'small',
  placement = 'bottomRight',
}: ThemeToggleProps) {
  const { mode, setMode, resolved } = useTheme()

  const items: MenuProps['items'] = [
    {
      key: 'light',
      icon: <SunOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          Light
          {mode === 'light' ? <CheckOutlined style={{ color: 'var(--ant-color-primary)' }} /> : null}
        </span>
      ),
      onClick: () => setMode('light'),
    },
    {
      key: 'dark',
      icon: <MoonOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          Dark
          {mode === 'dark' ? <CheckOutlined style={{ color: 'var(--ant-color-primary)' }} /> : null}
        </span>
      ),
      onClick: () => setMode('dark'),
    },
    {
      key: 'system',
      icon: <BulbOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          System
          {mode === 'system' ? <CheckOutlined style={{ color: 'var(--ant-color-primary)' }} /> : null}
        </span>
      ),
      onClick: () => setMode('system'),
    },
  ]

  const icon = resolved === 'dark' ? <MoonOutlined /> : <SunOutlined />
  const ghost = variant === 'ghostOnDark'
  const ticketNav = variant === 'ticketNav'

  return (
    <Dropdown menu={{ items }} placement={placement} trigger={['click']}>
      <Button
        type={ghost ? 'text' : 'default'}
        size={ticketNav ? 'middle' : size}
        icon={icon}
        title="Theme: light / dark / system"
        style={
          ticketNav
            ? ticketNavButtonStyle
            : ghost
              ? { color: '#fff' }
              : undefined
        }
      />
    </Dropdown>
  )
}
