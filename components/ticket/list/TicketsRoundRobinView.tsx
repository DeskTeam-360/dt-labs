'use client'

import { DeleteOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons'
import { Button, Dropdown, Flex, Modal,Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'

import type { StatusColumn, TicketRecord } from './types'
import { DEFAULT_ALL_STATUS_COLUMNS, sortTickets,TICKETS_LIST_SORT_BY, TICKETS_LIST_SORT_ORDER } from './types'

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
  canDeleteTicket?: boolean
}

function getStatusColor(status: string, columns: StatusColumn[]): string {
  const col = columns.find((c) => c.id === status)
  return col?.color ?? '#d9d9d9'
}

export default function TicketsRoundRobinView({
  tickets,
  statusColumns = DEFAULT_ALL_STATUS_COLUMNS,
  onEdit,
  onDelete,
  canDeleteTicket = false,
}: TicketsRoundRobinViewProps) {
  const router = useRouter()
  // Group tickets by company
  const byCompany = new Map<string, TicketRecord[]>()
  for (const t of tickets) {
    const key = t.company_id ?? '__no_company__'
    if (!byCompany.has(key)) byCompany.set(key, [])
    byCompany.get(key)!.push(t)
  }

  /** Sama seperti daftar/kanban: Priority naik dalam satu company, dengan tie-break id. */
  for (const [cid, arr] of byCompany) {
    byCompany.set(cid, sortTickets(arr, TICKETS_LIST_SORT_BY, TICKETS_LIST_SORT_ORDER))
  }

  const companyIds = Array.from(byCompany.keys()).sort((a, b) => {
    if (a === '__no_company__') return 1
    if (b === '__no_company__') return -1
    return a.localeCompare(b)
  })
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
        const textColor = ticket.type?.color ?? '#000'
        const p = Number(ticket.priority ?? 0)
        const priorityColor =
          p > 0 ? `2px solid ${p <= 1 ? '#52c41a' : p <= 2 ? '#faad14' : '#ff4d4f'}` : 'none'
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
                    ...(canDeleteTicket
                      ? [
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
                        ]
                      : []),
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
