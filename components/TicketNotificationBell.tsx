'use client'

import { App, Badge, Popover, Typography, Spin, Empty, Tooltip } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { Text } = Typography
const POLL_MS = 12_000

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

export type TicketNotificationItem = {
  id: string
  ticketId: number
  ticketTitle: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string | null
  actorUserId: string
  actorName: string
}

export default function TicketNotificationBell() {
  const { notification, message } = App.useApp()
  const { status, data: session } = useSession()
  const router = useRouter()
  const sessionUserId = session?.user?.id
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TicketNotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingRead, setDeletingRead] = useState(false)

  const initialHydratedRef = useRef(false)
  const alertedIdsRef = useRef<Set<string>>(new Set())

  /** App.useApp() may return new `notification` every render — use refs so polling effect stays stable */
  const notificationRef = useRef(notification)
  const routerRef = useRef(router)
  notificationRef.current = notification
  routerRef.current = router

  const enabled = status === 'authenticated'

  const fetchNotifications = useCallback(async () => {
    const res = await fetch('/api/notifications', { credentials: 'include' })
    const data = (await res.json().catch(() => ({}))) as {
      items?: TicketNotificationItem[]
    }
    return Array.isArray(data.items) ? data.items : []
  }, [])

  const processNewUnreadAlerts = useCallback((list: TicketNotificationItem[]) => {
    if (!initialHydratedRef.current) {
      initialHydratedRef.current = true
      for (const n of list) {
        if (!n.read) alertedIdsRef.current.add(n.id)
      }
      return
    }
    const nApi = notificationRef.current
    const nav = routerRef.current
    for (const n of list) {
      if (n.read || alertedIdsRef.current.has(n.id)) continue
      alertedIdsRef.current.add(n.id)
      nApi.info({
        message: n.title,
        description: n.body,
        placement: 'topRight',
        duration: 10,
        onClick: () => {
          nApi.destroy()
          nav.push(`/tickets/${n.ticketId}`)
        },
      })
      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(n.title, { body: n.body.slice(0, 200), tag: `ticket-${n.id}` })
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    initialHydratedRef.current = false
    alertedIdsRef.current = new Set()
  }, [sessionUserId])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      initialHydratedRef.current = false
      alertedIdsRef.current = new Set()
      return
    }

    let cancelled = false
    let visibilityTickTimer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      setLoading(true)
      try {
        const list = await fetchNotifications()
        if (cancelled) return
        setItems(list)
        processNewUnreadAlerts(list)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void tick()
    const interval = setInterval(() => void tick(), POLL_MS)

    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (visibilityTickTimer) clearTimeout(visibilityTickTimer)
      visibilityTickTimer = setTimeout(() => {
        visibilityTickTimer = null
        void tick()
      }, 400)
    }

    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      if (visibilityTickTimer) clearTimeout(visibilityTickTimer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
    // Only re-subscribe when auth gate or fetcher identity changes — not when Ant Design context identity changes
  }, [enabled, fetchNotifications, processNewUnreadAlerts])

  const unreadCount = useMemo(() => items.filter((i) => !i.read).length, [items])
  const readCount = useMemo(() => items.filter((i) => i.read).length, [items])

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
    [markReadApi]
  )

  const markAllRead = useCallback(async () => {
    const unread = items.filter((i) => !i.read).map((i) => i.id)
    if (unread.length === 0) return
    await markReadApi(unread)
    setItems((prev) => prev.map((i) => (i.read ? i : { ...i, read: true })))
  }, [items, markReadApi])

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
  }, [readCount, message])

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

  if (!enabled) return null

  const popoverContent = (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 32px)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Text strong style={{ fontSize: 13 }}>
          Notifications
        </Text>
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
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications yet" />
      ) : (
        <div style={{ maxHeight: 380, overflow: 'auto' }}>
          {items.map((n) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onItemClick(n)
                }
              }}
              style={{
                cursor: 'pointer',
                padding: '10px 8px',
                background: n.read ? undefined : 'rgba(102, 126, 234, 0.06)',
                borderRadius: 6,
              }}
              onClick={() => onItemClick(n)}
            >
              <div style={{ width: '100%', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
                  #{n.ticketId}
                  {n.createdAt ? ` · ${dayjs(n.createdAt).fromNow()}` : ''}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{n.title}</div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }} ellipsis>
                  {n.body}
                </Text>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <Popover
      content={popoverContent}
      trigger={['hover', 'click']}
      mouseEnterDelay={0.12}
      mouseLeaveDelay={0.28}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      destroyOnHidden={false}
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
