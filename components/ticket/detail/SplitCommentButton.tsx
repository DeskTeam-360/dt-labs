'use client'

import { ForkOutlined } from '@ant-design/icons'
import { Alert, Button, Input, message, Modal, Tooltip, Typography } from 'antd'
import { useState } from 'react'

const { Text } = Typography

const toPlain = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()

/** Makes a new ticket from one reply (a new request that landed in an old thread). The reply stays, marked. */
export default function SplitCommentButton({ ticketId, commentId, commentHtml }: { ticketId: number; commentId: string; commentHtml: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const start = () => {
    setTitle(toPlain(commentHtml).slice(0, 120))
    setOpen(true)
  }

  const split = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/split`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId, title: title.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { new_ticket_id?: number; error?: string }
      if (!res.ok || !data.new_ticket_id) throw new Error(data.error || 'Could not split the ticket')
      message.success(`New ticket #${data.new_ticket_id} created`)
      setOpen(false)
      window.open(`/tickets/${data.new_ticket_id}`, '_blank', 'noopener')
      // Show the "Split to #N" mark on the reply.
      window.location.reload()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Tooltip title="Split into a new ticket">
        <Button icon={<ForkOutlined />} size="middle" onClick={start} />
      </Tooltip>
      <Modal
        title="Split into a new ticket"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void split()}
        okText="Create new ticket"
        confirmLoading={saving}
        okButtonProps={{ disabled: !title.trim() }}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="Make a new ticket from this reply"
          description="The reply stays on this ticket and is marked Split to #(new ticket), with a link. The new ticket gets its text as the description and its files, with no comments. It keeps this ticket's company, team and type, is written by the same person, and no email is sent."
        />
        <Text strong>Title of the new ticket</Text>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} style={{ marginTop: 4 }} />
      </Modal>
    </>
  )
}
