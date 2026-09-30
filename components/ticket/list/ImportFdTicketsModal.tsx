'use client'

import { App, Button, Input, Modal, Table, Tag, Typography } from 'antd'
import { useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'

const { Text, Paragraph } = Typography

const MAX_IDS = 50

type ImportResult = {
  ticketId: number
  status: 'imported' | 'already_imported' | 'not_found' | 'id_conflict' | 'error'
  message: string
  title?: string
  company?: string | null
  comments?: { imported: number; skipped: number; errors: number }
  attachments?: { imported: number; failed: number; errors: { file: string; reason: string }[] }
}

const STATUS_TAG: Record<ImportResult['status'], { color: string; label: string }> = {
  imported: { color: 'green', label: 'Imported' },
  already_imported: { color: 'default', label: 'Already imported' },
  not_found: { color: 'orange', label: 'Not found in FD' },
  id_conflict: { color: 'red', label: 'ID in use' },
  error: { color: 'red', label: 'Error' },
}

function parseTicketIds(input: string): number[] {
  const ids = input
    .split(/[\s,;]+/)
    .map((v) => Number(v.replace(/^#/, '')))
    .filter((n) => Number.isInteger(n) && n > 0)
  return [...new Set(ids)]
}

export default function ImportFdTicketsModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported?: () => void
}) {
  const { message } = App.useApp()
  const [input, setInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const ids = parseTicketIds(input)
  const tooMany = ids.length > MAX_IDS

  const runImport = async () => {
    if (ids.length === 0 || tooMany) return
    setImporting(true)
    setResults(null)
    try {
      const res = await fetch('/api/freshdesk/import-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ticket_ids: ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Import failed')
      const list = (data.results ?? []) as ImportResult[]
      setResults(list)
      const imported = list.filter((r) => r.status === 'imported').length
      message.success(`${imported} of ${list.length} ticket(s) imported`)
      if (imported > 0) onImported?.()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const close = () => {
    if (importing) return
    setInput('')
    setResults(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      title="Import tickets from Freshdesk"
      onCancel={close}
      width={760}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={close} disabled={importing}>
          Close
        </Button>,
        <Button key="import" type="primary" loading={importing} disabled={ids.length === 0 || tooMany} onClick={runImport}>
          {importing ? 'Importing…' : ids.length > 0 ? `Import ${ids.length} ticket${ids.length === 1 ? '' : 's'}` : 'Import'}
        </Button>,
      ]}
    >
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Enter Freshdesk ticket IDs. Each ticket is imported with its comments and attachments and keeps its Freshdesk
        ID; its company and requester are matched or created. Tickets that already exist are skipped, never overwritten.
      </Paragraph>
      <Input.TextArea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="110301, 110664"
        autoSize={{ minRows: 3, maxRows: 8 }}
        disabled={importing}
        autoFocus
      />
      <Text type={tooMany ? 'danger' : 'secondary'} style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
        {tooMany
          ? `${ids.length} IDs entered. Import at most ${MAX_IDS} at a time.`
          : 'Separate IDs with commas, spaces or new lines.'}
      </Text>

      {results && (
        <Table<ImportResult>
          style={{ marginTop: 16 }}
          size="small"
          rowKey="ticketId"
          pagination={false}
          dataSource={results}
          columns={[
            {
              title: 'Ticket',
              key: 'ticket',
              render: (_, r) => {
                const label = `#${r.ticketId}${r.title ? ` ${r.title}` : ''}`
                return r.status === 'imported' || r.status === 'already_imported' ? (
                  <SpaNavLink href={`/tickets/${r.ticketId}`}>{label}</SpaNavLink>
                ) : (
                  <Text>{label}</Text>
                )
              },
            },
            {
              title: 'Result',
              key: 'status',
              width: 140,
              render: (_, r) => <Tag color={STATUS_TAG[r.status].color}>{STATUS_TAG[r.status].label}</Tag>,
            },
            {
              title: 'Details',
              key: 'details',
              render: (_, r) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {r.status === 'imported'
                    ? `${r.company ? `${r.company} · ` : ''}${r.comments?.imported ?? 0} comment(s), ${r.attachments?.imported ?? 0} attachment(s)${
                        r.attachments && r.attachments.failed > 0
                          ? ` · ${r.attachments.failed} file(s) failed: ${r.attachments.errors.map((e) => e.file).join(', ')}`
                          : ''
                      }`
                    : r.message}
                </Text>
              ),
            },
          ]}
        />
      )}
    </Modal>
  )
}
