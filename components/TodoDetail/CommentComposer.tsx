'use client'

import { useState } from 'react'
import { Button, Flex } from 'antd'
import { CommentOutlined, SendOutlined, PaperClipOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import CommentWysiwyg from './CommentWysiwyg'
import { uploadTicketFile } from '@/utils/storage'

interface CommentComposerProps {
  ticketId: number
  onAddComment: (commentText: string, attachments: { url: string; file_name: string; file_path: string }[]) => Promise<void>
  loading?: boolean
  commentVisibility?: 'note' | 'reply'
  onCommentVisibilityChange?: (v: 'note' | 'reply') => void
  showNoteOption?: boolean
}

export default function CommentComposer({
  ticketId,
  onAddComment,
  loading = false,
  commentVisibility = 'reply',
  onCommentVisibilityChange,
  showNoteOption = false,
}: CommentComposerProps) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
  const [uploading, setUploading] = useState(false)

  const handleSubmit = async () => {
    if (!draft.trim()) return
    try {
      await onAddComment(draft.trim(), attachments)
      setDraft('')
      setAttachments([])
    } catch {
      // Error already shown by parent
    }
  }

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const result = await uploadTicketFile(file, ticketId, 'comments')
        if (result.url && result.path) {
          setAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
        }
      }
    } finally {
      setUploading(false)
    }
  }

  const placeholder = showNoteOption
    ? commentVisibility === 'note'
      ? 'Add a note (agent only)...'
      : 'Reply (visible to client)...'
    : 'Add a comment...'

  return (
    <Flex vertical gap={8} style={{ marginTop: 8 }}>
      {showNoteOption && onCommentVisibilityChange && (
        <Flex gap={8}>
          <Button type="default" icon={<CommentOutlined />} onClick={() => onCommentVisibilityChange('note')}>
            Add note
          </Button>
          <Button type="primary" icon={<SendOutlined />} onClick={() => onCommentVisibilityChange('reply')}>
            Reply
          </Button>
        </Flex>
      )}
      <CommentWysiwyg
        ticketId={ticketId}
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        height="200px"
      />
      {attachments.length > 0 && (
        <Flex gap={8} wrap="wrap" align="center">
          {attachments.map((a, i) => (
            <Flex key={i} align="center" gap={4} style={{ padding: '4px 8px', background: '#f5f5f5', borderRadius: 6 }}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <PaperClipOutlined /> {a.file_name}
              </a>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
            </Flex>
          ))}
        </Flex>
      )}
      <Flex gap={8}>
        <input
          type="file"
          multiple
          style={{ display: 'none' }}
          id="comment-files-input"
          onChange={(e) => {
            handleFilesSelected(e.target.files)
            e.target.value = ''
          }}
        />
        <Button
          icon={<PaperClipOutlined />}
          onClick={() => document.getElementById('comment-files-input')?.click()}
          loading={uploading}
        >
          Attach files
        </Button>
        <Button
          type="primary"
          style={{ width: '200px' }}
          icon={<PlusOutlined />}
          onClick={handleSubmit}
          loading={loading}
          disabled={loading}
        >
          {showNoteOption ? (commentVisibility === 'note' ? 'Add note' : 'Reply') : 'Reply'}
        </Button>
      </Flex>
    </Flex>
  )
}
