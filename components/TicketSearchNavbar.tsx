'use client'

import { Input, Spin } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SpaNavLink } from '@/components/SpaNavLink'

const NAV_HEIGHT = 56
const TITLE = process.env.NEXT_PUBLIC_APP_NAME || 'Deskteam360'
const PREVIEW_MIN_CHARS = 2
const PREVIEW_LIMIT = 5
const DEBOUNCE_MS = 300

type TicketPreview = {
  id: number
  title: string | null
  companyName: string | null
  priorityTitle: string | null
  priorityColor: string | null
}

/**
 * Bar di **atas area konten** (kolom kanan sidebar): judul + pencarian tiket.
 * Preview dropdown sampai 5 tiket (nomor, judul, company, priority); klik → detail tiket.
 */
export default function TicketSearchNavbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<TicketPreview[]>([])
  const [panelVisible, setPanelVisible] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname !== '/tickets' && pathname !== '/tickets/') return
    const sp = new URLSearchParams(window.location.search)
    setQ(sp.get('search') ?? '')
  }, [pathname])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPanelVisible(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 16px',
        height: NAV_HEIGHT,
        minHeight: NAV_HEIGHT,
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexShrink: 0,
      }}
    >
      <SpaNavLink
        href="/dashboard"
        style={{ fontWeight: 600, color: '#2b1252', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {TITLE}
      </SpaNavLink>
      <div ref={wrapRef} style={{ position: 'relative', flex: 1, maxWidth: 520, minWidth: 0 }}>
        <Input.Search
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
    </div>
  )
}
