'use client'

import { Table, Typography, Dropdown, Button, Flex, Modal } from 'antd'
import { MoreOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import type { ColumnsType } from 'antd/es/table'
import type { TicketRecord, StatusColumn } from './types'
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

const STATUS_ORDER = ['to_do', 'in_progress', 'completed', 'cancel', 'archived']

function getStatusColor(status: string, columns: StatusColumn[]): string {
  const col = columns.find((c) => c.id === status)
  return col?.color ?? '#d9d9d9'
}

function sortTicketsByProgress(a: TicketRecord, b: TicketRecord): number {
  const ai = STATUS_ORDER.indexOf(a.status)
  const bi = STATUS_ORDER.indexOf(b.status)
  if (ai !== bi) return ai - bi
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

  // Sort tickets per company by progress (to_do -> in_progress -> completed)
  for (const arr of byCompany.values()) {
    arr.sort(sortTicketsByProgress)
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
              <div
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/tickets/${ticket.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && router.push(`/tickets/${ticket.id}`)}
                style={{
                  display: 'inline-block',
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
              </div>
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
                      label: 'Delete',
                      icon: <DeleteOutlined />,
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: 'Delete Ticket',
                          content: 'Are you sure?',
                          okText: 'Yes',
                          cancelText: 'No',
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
