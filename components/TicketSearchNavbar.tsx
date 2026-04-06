'use client'

import { Input, Spin, Tooltip, Typography } from 'antd'
import { CloseOutlined, HistoryOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SpaNavLink } from '@/components/SpaNavLink'
import {
  loadSavedTicketFilterPresets,
  removeSavedTicketFilterPreset,
  SAVED_FILTERS_CHANGED_EVENT,
  type SavedTicketFilterPreset,
} from '@/lib/ticket-saved-filters'
import {
  formatTicketActivityNavbarLabel,
  isTicketActivityNavbarPeekRow,
} from '@/lib/ticket-activity-labels'
import TicketActivityActorAvatar from '@/components/TicketActivityActorAvatar'
import TicketNotificationBell from '@/components/TicketNotificationBell'

dayjs.extend(relativeTime)
dayjs.locale('en')

const { Text } = Typography

type ActivityPeekRow = {
  id: string
  ticket_id: number
  ticket_title: string
  action: string
  actor_role: string
  created_at: string
  actor: { name: string | null; email: string | null; avatar_url?: string | null } | null
}

const NAV_HEIGHT = 56
/** Match Ant Design `large` controls so search + history icon align on one line. */
const NAV_CONTROL_SIZE = 'large' as const
const TITLE = process.env.NEXT_PUBLIC_APP_NAME || 'Deskteam360'
const PREVIEW_MIN_CHARS = 2
const PREVIEW_LIMIT = 5
const DEBOUNCE_MS = 300
/** Fetch extra rows so after filtering (created / customer reply / edit) we can still show up to 10. */
const ACTIVITY_PEEK_FETCH_LIMIT = 40
const ACTIVITY_PEEK_SHOW = 10

type TicketPreview = {
  id: number
  title: string | null
  companyName: string | null
  priorityTitle: string | null
  priorityColor: string | null
}

/**
 * Top content bar (right column beside the sidebar): app title + ticket search.
 * Preview lists up to 5 tickets (id, title, company, priority); click opens ticket detail.
 * `savedFiltersUserId`: when set (staff/admin), shows saved filter shortcuts next to search.
 */
export default function TicketSearchNavbar({ savedFiltersUserId }: { savedFiltersUserId?: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const listSearchKey = searchParams.toString()
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<TicketPreview[]>([])
  const [panelVisible, setPanelVisible] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const historyLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyWrapRef = useRef<HTMLDivElement>(null)

  const [savedPresets, setSavedPresets] = useState<SavedTicketFilterPreset[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<ActivityPeekRow[]>([])

  const loadHistoryPeek = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch(
        `/api/ticket-activity?limit=${ACTIVITY_PEEK_FETCH_LIMIT}&offset=0`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('fetch failed')
      const body = (await res.json()) as { data?: ActivityPeekRow[] }
      const raw = Array.isArray(body.data) ? body.data : []
      setHistoryRows(raw.filter(isTicketActivityNavbarPeekRow).slice(0, ACTIVITY_PEEK_SHOW))
    } catch {
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!savedFiltersUserId) {
      setSavedPresets([])
      return
    }
    const load = () => setSavedPresets(loadSavedTicketFilterPresets(savedFiltersUserId))
    load()
    window.addEventListener(SAVED_FILTERS_CHANGED_EVENT, load)
    return () => window.removeEventListener(SAVED_FILTERS_CHANGED_EVENT, load)
  }, [savedFiltersUserId])

  useEffect(() => {
    if (pathname !== '/tickets' && pathname !== '/tickets/') return
    setQ(searchParams.get('search') ?? '')
  }, [pathname, listSearchKey, searchParams])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPanelVisible(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  useEffect(() => {
    return () => {
      if (historyLeaveTimer.current) clearTimeout(historyLeaveTimer.current)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = q.trim()
    if (trimmed.length < PREVIEW_MIN_CHARS) {
      setPreview([])
      setPanelVisible(false)
      setPreviewLoading(false)
      abortRef.current?.abort()
      return
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setPanelVisible(true)
      setPreviewLoading(true)
      setPreview([])
      try {
        const res = await fetch(
          `/api/tickets?search=${encodeURIComponent(trimmed)}&limit=${PREVIEW_LIMIT}`,
          { credentials: 'include', signal: ac.signal }
        )
        if (!res.ok) throw new Error('fetch failed')
        const data = (await res.json()) as unknown
        const list = Array.isArray(data) ? data : []
        const next: TicketPreview[] = list
          .slice(0, PREVIEW_LIMIT)
          .map((row: unknown) => {
            const r = row as {
              id?: number
              title?: string | null
              company?: { name?: string | null } | null
              priority?: { title?: string | null; color?: string | null } | null
            }
            const companyName = r.company?.name?.trim() || null
            const priorityTitle = r.priority?.title?.trim() || null
            const priorityColor = r.priority?.color?.trim() || null
            return {
              id: r.id ?? 0,
              title: r.title ?? '',
              companyName,
              priorityTitle,
              priorityColor,
            }
          })
          .filter((r) => r.id > 0)
        setPreview(next)
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
        setPreview([])
        setPanelVisible(false)
      } finally {
        if (!ac.signal.aborted) setPreviewLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q])

  const applySearch = useCallback(
    (value: string) => {
      setPanelVisible(false)
      const trimmed = value.trim()
      const onTicketList = pathname === '/tickets' || pathname === '/tickets/'
      if (onTicketList) {
        const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        if (trimmed) sp.set('search', trimmed)
        else sp.delete('search')
        const qs = sp.toString()
        router.push(qs ? `/tickets?${qs}` : '/tickets', { scroll: false })
      } else {
        router.push(trimmed ? `/tickets?search=${encodeURIComponent(trimmed)}` : '/tickets')
      }
    },
    [pathname, router]
  )

  const goTicket = useCallback(
    (id: number) => {
      setPanelVisible(false)
      setQ('')
      setPreview([])
      router.push(`/tickets/${id}`)
    },
    [router]
  )

  const openHistory = useCallback(() => {
    if (historyLeaveTimer.current) {
      clearTimeout(historyLeaveTimer.current)
      historyLeaveTimer.current = null
    }
    setHistoryOpen(true)
    void loadHistoryPeek()
  }, [loadHistoryPeek])

  const scheduleCloseHistory = useCallback(() => {
    if (historyLeaveTimer.current) clearTimeout(historyLeaveTimer.current)
    historyLeaveTimer.current = setTimeout(() => setHistoryOpen(false), 200)
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
        height: NAV_HEIGHT,
        minHeight: NAV_HEIGHT,
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          flexShrink: 0,
        }}
      >
        <SpaNavLink
          href="/dashboard"
          style={{
            fontWeight: 600,
            color: '#2b1252',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
        >
          {TITLE}
        </SpaNavLink>
      </div>

      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          flex: 1,
          maxWidth: 520,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
        }}
      >
        <Input.Search
          size={NAV_CONTROL_SIZE}
          allowClear
          placeholder="Search tickets (title, description)…"
          enterButton={<SearchOutlined />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={applySearch}
          onFocus={() => {
            if (q.trim().length >= PREVIEW_MIN_CHARS && (preview.length > 0 || previewLoading)) {
              setPanelVisible(true)
            }
          }}
          style={{ width: '100%' }}
        />
        {panelVisible && q.trim().length >= PREVIEW_MIN_CHARS && (
          <div
            role="listbox"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              marginTop: 4,
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              border: '1px solid #f0f0f0',
              maxHeight: 360,
              overflow: 'auto',
              zIndex: 200,
            }}
          >
            {previewLoading ? (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : preview.length > 0 ? (
              preview.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  onClick={() => goTicket(t.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 4,
                    width: '100%',
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: '1px solid #f5f5f5',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 14,
                    minWidth: 0,
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 8 }}>
                    <span style={{ color: '#8c8c8c', fontSize: 12, flexShrink: 0 }}>#{t.id}</span>
                    <span
                      style={{ color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {t.title || '(No title)'}
                    </span>
                  </div>
                  {(t.companyName || t.priorityTitle) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        fontSize: 12,
                        color: '#8c8c8c',
                        minWidth: 0,
                      }}
                    >
                      {t.companyName && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                          {t.companyName}
                        </span>
                      )}
                      {t.companyName && t.priorityTitle && (
                        <span style={{ color: '#d9d9d9', flexShrink: 0 }} aria-hidden>
                          ·
                        </span>
                      )}
                      {t.priorityTitle && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            flexShrink: 0,
                            maxWidth: '100%',
                          }}
                        >
                          {t.priorityColor ? (
                            <span
                              aria-hidden
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: t.priorityColor,
                                flexShrink: 0,
                              }}
                            />
                          ) : null}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.priorityTitle}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div style={{ padding: 12, color: '#8c8c8c', fontSize: 13 }}>No tickets found</div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
          gap: 6,
        }}
      >
        <TicketNotificationBell />
      </div>

      <div
        ref={historyWrapRef}
        style={{
          position: 'relative',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          alignSelf: 'stretch',
        }}
        onMouseEnter={openHistory}
        onMouseLeave={scheduleCloseHistory}
      >
        {/* <Tooltip title="Ticket activity history"> */}
          <button
            type="button"
            aria-label="Ticket activity history"
            onClick={() => router.push('/ticket-activity')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              padding: 0,
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              background: '#fff',
              color: '#2b1252',
              cursor: 'pointer',
            }}
          >
            <HistoryOutlined style={{ fontSize: 18 }} />
          </button>
        {/* </Tooltip> */}
        {historyOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              width: 380,
              maxWidth: 'calc(100vw - 32px)',
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              border: '1px solid #f0f0f0',
              zIndex: 220,
              overflow: 'hidden',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>
              Recent activity
            </div>
            {historyLoading ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : historyRows.length === 0 ? (
              <div style={{ padding: 14, color: '#8c8c8c', fontSize: 13 }}>No activity yet</div>
            ) : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {historyRows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHistoryOpen(false)
                      router.push(`/tickets/${r.ticket_id}`)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      alignSelf: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 14px',
                      border: 'none',
                      borderBottom: '1px solid #f5f5f5',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 13,
                    }}
                  >
                    <TicketActivityActorAvatar
                      size={36}
                      actorRole={r.actor_role}
                      avatarUrl={r.actor?.avatar_url}
                      name={r.actor?.name}
                      email={r.actor?.email}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: '#8c8c8c', fontSize: 11, marginBottom: 4 }}>
                        #{r.ticket_id} · {r.created_at ? dayjs(r.created_at).fromNow() : '—'}
                      </div>
                      <div style={{ fontWeight: 500, color: '#262626', marginBottom: 2 }}>
                        {formatTicketActivityNavbarLabel(r.action, r.actor_role)}
                      </div>
                      <div
                        style={{
                          color: '#595959',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.ticket_title || '(No title)'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
              <SpaNavLink
                href="/ticket-activity"
                style={{ fontSize: 13, fontWeight: 500, color: '#2b1252' }}
                onClick={() => setHistoryOpen(false)}
              >
                See all
              </SpaNavLink>
            </div>
          </div>
        )}
      </div>

      {savedFiltersUserId && savedPresets.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'stretch',
            gap: 8,
            flex: 1,
            minWidth: 0,
            maxWidth: 480,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.03 }}>
            My Filters
          </Text>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflowX: 'auto',
              flex: 1,
              minWidth: 0,
              scrollbarWidth: 'thin',
            }}
          >
            {savedPresets.map((p) => (
              <span
                key={p.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  flexShrink: 0,
                  background: '#f5f0ff',
                  border: '1px solid #d3adf7',
                  borderRadius: 6,
                  padding: '2px 2px 2px 8px',
                  fontSize: 13,
                }}
              >
                <SpaNavLink
                  href={p.query ? `/tickets?${p.query}` : '/tickets'}
                  title={p.name}
                  style={{
                    color: '#2b1252',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </SpaNavLink>
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (savedFiltersUserId) removeSavedTicketFilterPreset(savedFiltersUserId, p.id)
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 4,
                    color: '#8c8c8c',
                    lineHeight: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      
    </div>
  )
}
