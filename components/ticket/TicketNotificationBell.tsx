'use client'

import { BellOutlined } from '@ant-design/icons'
import { App, Badge, Popover, Spin, Tooltip } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { type CSSProperties, useCallback, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import { type TicketNotificationItem, useNotificationPoll } from '@/components/providers/NotificationPollProvider'
import TicketActivityActorAvatar from '@/components/ticket/TicketActivityActorAvatar'

dayjs.extend(relativeTime)

/** Decode HTML entities like &nbsp; to regular characters */
const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

/** Match TicketSearchNavbar history control — subtle hover on white pill */
const navControlButtonStyle = (base?: CSSProperties): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 10px',
  minHeight: 28,
  border: '1px solid var(--ticket-nav-icon-btn-border)',
  borderRadius: 8,
  background: 'var(--ticket-nav-icon-btn-bg)',
  color: 'var(--ticket-nav-icon-btn-color)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1.3,
  ...base,
})

export default function TicketNotificationBell() {
  const { message } = App.useApp()
  const { status } = useSession()
  const router = useRouter()
  const { items, loading, unreadCount, readCount, setItems, refresh, clearUnreadExtra } = useNotificationPoll()
  const [open, setOpen] = useState(false)
  const [deletingRead, setDeletingRead] = useState(false)

  const markReadApi = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids }),
    })
  }, [])

  const markRead = useCallback(
    async (id: string) => {
      await markReadApi([id])
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)))
    },
    [markReadApi, setItems]
  )

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ all: true }),
    })
    setItems((prev) => prev.map((i) => (i.read ? i : { ...i, read: true })))
    clearUnreadExtra()
  }, [unreadCount, setItems, clearUnreadExtra])

  const deleteAllRead = useCallback(async () => {
    if (readCount === 0) return
    setDeletingRead(true)
    try {
      const res = await fetch('/api/notifications/delete-read', {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string }
      if (!res.ok) {
        message.error(data.error || 'Could not delete notifications')
        return
      }
      setItems((prev) => prev.filter((i) => !i.read))
      message.success(
        data.deleted != null && data.deleted > 0
          ? `Removed ${data.deleted} read notification(s)`
          : 'Read notifications removed'
      )
    } catch {
      message.error('Could not delete notifications')
    } finally {
      setDeletingRead(false)
    }
  }, [readCount, message, setItems])

  const onItemClick = useCallback(
    (n: TicketNotificationItem) => {
      void markRead(n.id)
      setOpen(false)
      router.push(`/tickets/${n.ticketId}`)
    },
    [markRead, router]
  )

  const hoverSurface = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'var(--ticket-nav-icon-hover-bg)'
  }
  const hoverSurfaceLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'var(--ticket-nav-icon-btn-bg)'
  }

  if (status !== 'authenticated') return null

  const popoverContent = (
    <div style={{ width: 380, maxWidth: 'calc(100vw - 32px)' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--ticket-nav-panel-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ticket-nav-text)' }}>Notifications</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {unreadCount > 0 && (
            <Tooltip title="Mark all as read">
              <button
                type="button"
                disabled={deletingRead}
                onClick={() => void markAllRead()}
                style={navControlButtonStyle()}
                onMouseEnter={hoverSurface}
                onMouseLeave={hoverSurfaceLeave}
              >
                Mark all read
              </button>
            </Tooltip>
          )}
          {readCount > 0 && (
            <Tooltip title="Delete all read notifications">
              <button
                type="button"
                disabled={deletingRead}
                onClick={() => void deleteAllRead()}
                style={navControlButtonStyle({
                  color: deletingRead ? '#bfbfbf' : '#cf1322',
                  borderColor: '#ffccc7',
                })}
                onMouseEnter={hoverSurface}
                onMouseLeave={hoverSurfaceLeave}
              >
                {deletingRead ? 'Deleting…' : 'Delete read'}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      {loading && items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 14, color: 'var(--ticket-nav-muted)', fontSize: 13 }}>No notifications yet</div>
      ) : (
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              role="menuitem"
              onClick={() => onItemClick(n)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 14px',
                border: 'none',
                borderBottom: '1px solid var(--ticket-nav-panel-row-border)',
                background: n.read ? 'transparent' : 'rgba(102, 126, 234, 0.07)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
              }}
            >
              <TicketActivityActorAvatar
                size={36}
                actorRole="agent"
                avatarUrl={n.actorAvatarUrl}
                name={n.actorName}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: 'var(--ticket-nav-muted)', fontSize: 11, marginBottom: 4 }}>
                  #{n.ticketId}
                  {n.createdAt ? ` · ${dayjs(n.createdAt).fromNow()}` : ''}
                </div>
                <div style={{ fontWeight: n.read ? 500 : 600, color: 'var(--ticket-nav-text)', marginBottom: 2 }}>{n.title}</div>
                <div
                  style={{
                    color: 'var(--ticket-nav-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {decodeHtmlEntities(n.body)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--ticket-nav-panel-border)', textAlign: 'center' }}>
        <SpaNavLink
          href="/notifications"
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--ticket-nav-filter-link)' }}
          onClick={() => setOpen(false)}
        >
          See all
        </SpaNavLink>
      </div>
    </div>
  )

  return (
    <Popover
      content={popoverContent}
      trigger={['hover', 'click']}
      mouseEnterDelay={0.12}
      mouseLeaveDelay={0.28}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // The background poll runs every 2 minutes; fetch right away when the panel is opened.
        if (next) void refresh()
      }}
      placement="bottomRight"
      destroyOnHidden={false}
      styles={{ container: { padding: 0, overflow: 'hidden' } }}
    >
      <button
        type="button"
        aria-label="Notifications"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          padding: 0,
          border: '1px solid var(--ticket-nav-icon-btn-border)',
          borderRadius: 8,
          background: 'var(--ticket-nav-icon-btn-bg)',
          color: 'var(--ticket-nav-icon-btn-color)',
          cursor: 'pointer',
        }}
        onMouseEnter={hoverSurface}
        onMouseLeave={hoverSurfaceLeave}
      >
        <Badge count={unreadCount} size="small" offset={[-2, 2]}>
          <BellOutlined style={{ fontSize: 18 }} />
        </Badge>
      </button>
    </Popover>
  )
}
