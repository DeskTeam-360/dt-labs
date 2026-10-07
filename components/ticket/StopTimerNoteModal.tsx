'use client'

import { Form, Input, Modal, Typography } from 'antd'
import { useEffect, useState } from 'react'

const { Text } = Typography

export const TIMER_NOTE_MAX_LENGTH = 2000

/**
 * Asks for the (required) work note before a running timer is stopped or paused.
 * `onSubmit` receives the trimmed note; the modal stays open if it throws so the user can retry.
 */
export default function StopTimerNoteModal({
  open,
  title = 'Stop timer',
  okText = 'Stop timer',
  context,
  onCancel,
  onSubmit,
}: {
  open: boolean
  title?: string
  okText?: string
  /** e.g. "#203111 SpecialEd – Monthly Newsletter · 1h 12m" */
  context?: string | null
  onCancel: () => void
  onSubmit: (note: string) => Promise<void>
}) {
  const [form] = Form.useForm<{ note: string }>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) form.resetFields()
  }, [open, form])

  const handleOk = async () => {
    const { note } = await form.validateFields()
    setSubmitting(true)
    try {
      await onSubmit(note.trim())
    } catch {
      // Caller already showed the error; keep the modal open with the note intact.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      okButtonProps={{ danger: true }}
      confirmLoading={submitting}
      onOk={handleOk}
      onCancel={() => {
        if (!submitting) onCancel()
      }}
      destroyOnHidden
    >
      {context && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {context}
        </Text>
      )}
      <Form form={form} layout="vertical" onFinish={handleOk}>
        <Form.Item
          name="note"
          label="What did you work on?"
          rules={[
            { required: true, message: 'Note is required' },
            { whitespace: true, message: 'Note is required' },
          ]}
        >
          <Input.TextArea
            rows={4}
            autoFocus
            maxLength={TIMER_NOTE_MAX_LENGTH}
            showCount
            placeholder="Describe what was done during this time"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
