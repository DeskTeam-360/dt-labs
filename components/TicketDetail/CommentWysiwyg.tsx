'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState, useEffect, useRef } from 'react'
import { Input } from 'antd'
import { uploadTicketImage } from '@/utils/storage'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

import 'react-quill-new/dist/quill.snow.css'

type QuillEditor = {
  getSelection: (focus: boolean) => { index: number } | null
  getLength: () => number
  insertEmbed: (index: number, type: string, url: string, source: string) => void
  setSelection: (index: number) => void
}

const QUILL_FORMATS = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'list', 'bullet',
  'link',
  'image',
]

interface CommentWysiwygProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  height?: string
  /** Ticket/todo id for image upload path: ticket/{ticketId}/{unixtime}. Omit for draft path (ticket/draft/...). */
  ticketId?: string | number
}

export default function CommentWysiwyg({
  value = '',
  onChange,
  placeholder = 'Add a comment...',
  height = '200px',
  ticketId,
}: CommentWysiwygProps) {
  const [mounted, setMounted] = useState(false)
  const quillRef = useRef<{ getEditor: () => QuillEditor } | null>(null)
  const ticketIdRef = useRef(ticketId)
  ticketIdRef.current = ticketId

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image'],
        ['clean'],
      ],
      handlers: {
        image: function imageHandler(this: unknown) {
          const quill = quillRef.current?.getEditor?.()
          if (!quill) return
          const input = document.createElement('input')
          input.setAttribute('type', 'file')
          input.setAttribute('accept', 'image/*')
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            const { url, error } = await uploadTicketImage(file, ticketIdRef.current ?? undefined)
            if (error || !url) {
              console.error('Image upload failed:', error)
              return
            }
            const range = quill.getSelection(true)
            const index = range?.index ?? quill.getLength()
            quill.insertEmbed(index, 'image', url, 'user')
            quill.setSelection(index + 1)
          }
          input.click()
        },
      },
    },
  }), [])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Render a consistent placeholder on server and initial client to avoid hydration mismatch.
  // Only mount ReactQuill after hydration.
  if (!mounted) {
    return (
      <div className="comment-wysiwyg-wrapper" style={{ marginBottom: 8 }}>
        <Input.TextArea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          rows={10}
          readOnly
          style={{ minHeight: 200, resize: 'none', pointerEvents: 'none' }}
        />
      </div>
    )
  }

  const quillProps = {
    theme: 'snow',
    value,
    onChange: (v: string) => onChange?.(v),
    placeholder,
    modules,
    formats: QUILL_FORMATS,
    style: { height },
    ref: quillRef,
  }
  return (
    <div className="comment-wysiwyg-wrapper" style={{ marginBottom: 20 }}>
      {/* ref passed for image handler; react-quill-new types omit ref */}
      <ReactQuill {...(quillProps as React.ComponentProps<typeof ReactQuill>)} />
    </div>
  )
}
