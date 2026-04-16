'use client'

import { DeleteOutlined,EditOutlined, MoreOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Modal,Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'

import type { StatusColumn,TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS } from './types'

interface RoundRobinRow {
  key: string
  companyName: string
  company: string
  tickets: TicketRecord[]
}

interface TicketsRoundRobinViewProps {
  tickets: TicketRecord[]
  statusColumns?: StatusColumn[]
  onEdit?: (ticket: TicketRecord) => void
  onDelete?: (id: number) => void
}

function getStatusColor(status: string, columns: StatusColumn[]): string {
  const col = columns.find((c) => c.id === status)
  return col?.color ?? '#d9d9d9'
}

function sortTicketsByProgress(a: TicketRecord, b: TicketRecord, statusOrder: string[]): number {
  const ai = statusOrder.indexOf(a.status)
  const bi = statusOrder.indexOf(b.status)
  const aIdx = ai === -1 ? 9999 : ai
  const bIdx = bi === -1 ? 9999 : bi
  if (aIdx !== bIdx) return aIdx - bIdx
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

export default function TicketsRoundRobinView({
  tickets,
  statusColumns = DEFAULT_ALL_STATUS_COLUMNS,
  onEdit,
  onDelete,
}: TicketsRoundRobinViewProps) {
  const router = useRouter()
  // Group tickets by company
  const byCompany = new Map<string, TicketRecord[]>()
  for (const t of tickets) {
    const key = t.company_id ?? '__no_company__'
    if (!byCompany.has(key)) byCompany.set(key, [])
    byCompany.get(key)!.push(t)
  }

  const statusOrder = statusColumns.map((c) => c.id)
  for (const arr of byCompany.values()) {
    arr.sort((a, b) => sortTicketsByProgress(a, b, statusOrder))
  }

  const companyIds = Array.from(byCompany.keys())
  const maxSlots = Math.max(1, ...Array.from(byCompany.values()).map((a) => a.length))

  const columns: ColumnsType<RoundRobinRow> = [
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      fixed: 'left',
      width: 220,
      render: (_, row) => (
        <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
          {row.companyName}
        </Typography.Text>
      ),
    },
    ...Array.from({ length: maxSlots }, (_, i) => ({
      title: `Ticket ${i + 1}`,
      key: `slot${i}`,
      width: 140,
      align: 'center' as const,
      render: (_: unknown, row: RoundRobinRow) => {
        const ticket = row.tickets[i]
        if (!ticket) return null
        const bgColor = getStatusColor(ticket.status, statusColumns)
        const textColor = ticket.type?.color??'#000'
        const priorityColor = ticket.priority?.color?'2px solid '+ticket.priority?.color:'none'
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', }}>
            <Flex align="center" gap={4} justify="center" style={{ width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <a
                href={`/tickets/${ticket.id}`}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (e.button !== 0) return
                  if (e.ctrlKey || e.metaKey) return
                  e.preventDefault()
                  router.push(`/tickets/${ticket.id}`)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.ctrlKey || e.metaKey) return
                    e.preventDefault()
                    router.push(`/tickets/${ticket.id}`)
                  }
                }}
                style={{
                  display: 'inline-block',
                  textDecoration: 'none',
                  backgroundColor: bgColor,
                  color: textColor,
                  border: priorityColor,
                  padding: '4px 8px',
                  borderRadius: 40,
                  cursor: 'pointer',
                  margin: 0,
                  maxWidth: 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontSize: 12,
                  flex: 1,
                  minWidth: 100,
                }}
              >
                #{ticket.id}
              </a>
              <p style={{ fontSize: 9, margin: 0, padding: 0 }}>
              {ticket.short_note}
            </p>
              </div>
              <Dropdown
                menu={{
                  items: [
                    { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => onEdit?.(ticket) },
                    {
                      key: 'delete',
                      label: 'Move to trash',
                      icon: <DeleteOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: 'Move ticket to trash?',
                          content: 'The ticket will be hidden from the main list. Open Trash from the sidebar to review.',
                          okText: 'Move to trash',
                          okButtonProps: { danger: true },
                          cancelText: 'Cancel',
                          onOk: () => onDelete?.(ticket.id),
                        })
                      },
                    },
                  ],
                }}
                trigger={['click']}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  style={{ padding: 4, height: 28 }}
                />
              </Dropdown>
            </Flex>
            
          </div>
        )
      },
    })),
  ]

  const dataSource: RoundRobinRow[] = (companyIds as string[]).map((cid) => {
    const companyTickets = byCompany.get(cid)!
    const first = companyTickets[0]
    const companyName: string =
      cid === '__no_company__' ? 'No Company' : (first?.company?.name ?? cid)
    return {
      key: String(cid),
      companyName,
      company: String(cid),
      tickets: companyTickets,
    }
  })

  return (
    <div style={{ padding: 24, overflowX: 'auto' }}>
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
        bordered
      />
    </div>
  )
}
