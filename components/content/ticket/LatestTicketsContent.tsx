'use client'

import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Col, Empty, Flex, Layout, Pagination, Row, Spin, Tooltip, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { TicketTrackerStat } from '@/app/api/tickets/ticket-time-stats/route'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import CardViewCard from '@/components/ticket/list/CardViewCard'
import type { StatusColumn, TicketRecord } from '@/components/ticket/list/types'

const REFRESH_MS = 60 * 1000

interface LatestTicketsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

/** Newest incoming tickets first, paged on the server (limit/offset) instead of loading everything. */
export default function LatestTicketsContent({ user }: LatestTicketsContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusColumns, setStatusColumns] = useState<StatusColumn[]>([])
  const [trackerStats, setTrackerStats] = useState<Map<number, TicketTrackerStat>>(new Map())
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort_by: 'created_at',
        sort_order: 'desc',
        paginated: '1',
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      })
      const res = await fetch(`/api/tickets?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to load tickets')
      const body = (await res.json()) as { data?: TicketRecord[]; total?: number }
      if (requestId !== requestRef.current) return
      const rows = Array.isArray(body.data) ? body.data : []
      setTickets(rows)
      setTotal(typeof body.total === 'number' ? body.total : 0)
      setError(null)

      if (rows.length > 0) {
        fetch(`/api/tickets/ticket-time-stats?ticket_ids=${rows.map((t) => t.id).join(',')}`, { credentials: 'include' })
          .then((r) => r.json())
          .then((data: TicketTrackerStat[]) => {
            if (requestId !== requestRef.current || !Array.isArray(data)) return
            setTrackerStats(new Map(data.map((s) => [s.ticket_id, s])))
          })
          .catch(() => { /* stats are optional */ })
      }
    } catch (e) {
      if (requestId === requestRef.current) setError(e instanceof Error ? e.message : 'Failed to load tickets')
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  // Only the first page shows brand-new tickets, so only that page auto-refreshes.
  useEffect(() => {
    if (page !== 1) return
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [page, load])

  useEffect(() => {
    fetch('/api/ticket-statuses', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) return
        setStatusColumns(
          (data as { slug: string; title: string; color?: string | null }[]).map((s) => ({
            id: s.slug,
            title: s.title,
            color: s.color || '#d9d9d9',
          }))
        )
      })
      .catch(() => { /* fall back to default chip colors */ })
  }, [])

  const openTicket = (ticket: TicketRecord) => router.push(`/tickets/${ticket.id}`)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={user} style={{ overflow: 'hidden' }}>
        <Flex vertical gap={12} style={{ padding: 24 }}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Latest tickets
          </Typography.Title>
          <Flex>
            <Tooltip title="Refresh tickets">
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading} size="middle" />
            </Tooltip>
          </Flex>
        </Flex>

        <Alert
          type="info"
          showIcon
          message="Newest incoming tickets"
          description="All support tickets you can access, newest first. Spam and Trash are not included. The first page refreshes every minute."
          style={{ marginLeft: 24, marginRight: 48, marginBottom: 12 }}
        />

        {error && (
          <Alert type="error" showIcon message={error} style={{ marginLeft: 24, marginRight: 48, marginBottom: 12 }} />
        )}

        {loading && tickets.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Spin size="large" />
            <div style={{ marginTop: 12 }}>Loading tickets...</div>
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Empty description="No tickets" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <div style={{ width: '100%', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            <Row gutter={24} style={{ paddingRight: 24, paddingLeft: 24 }}>
              {tickets.map((ticket) => (
                <Col span={24} style={{ marginBottom: 12 }} key={ticket.id}>
                  <CardViewCard
                    ticket={ticket}
                    allStatusColumns={statusColumns}
                    onEdit={openTicket}
                    onDelete={() => {}}
                    canDeleteTicket={false}
                    trackerStat={trackerStats.get(ticket.id)}
                  />
                </Col>
              ))}
            </Row>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 24px' }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                pageSizeOptions={['10', '15', '20', '50']}
                showTotal={(t) => `Total ${t} tickets`}
                onChange={(p, ps) => {
                  if (ps !== pageSize) {
                    setPageSize(ps)
                    setPage(1)
                  } else {
                    setPage(p)
                  }
                }}
              />
            </div>
          </div>
        )}
      </AdminMainColumn>
    </Layout>
  )
}
