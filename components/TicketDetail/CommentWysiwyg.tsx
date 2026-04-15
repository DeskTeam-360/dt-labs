'use client'

import { Input } from 'antd'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef,useState } from 'react'

import { useTheme } from '@/components/ThemeProvider'
import { registerCommentWysiwygQuill } from '@/lib/comment-wysiwyg-quill-register'
import { uploadTicketImage } from '@/utils/storage'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

import 'react-quill-new/dist/quill.snow.css'

/** Full editor from ReactQuill / toolbar `this.quill` (not the read-only unprivileged proxy). */
type QuillFullEditor = {
  getSelection: (focus?: boolean) => { index: number; length?: number } | null
  getLength: () => number
  insertEmbed: (index: number, type: string, value: string | boolean, source?: string) => void
  setSelection: (index: number, length?: number, source?: string) => void
  focus: () => void
}

type QuillEditor = {
  getSelection: (focus: boolean) => { index: number } | null
  getLength: () => number
  insertEmbed: (index: number, type: string, value: string | boolean, source?: string) => void
  setSelection: (index: number, length?: number, source?: string) => void
}

const QUILL_FORMATS = [
  'header',
  'size',
  'color',
  'background',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'link',
  'image',
  /** Custom blot from `registerCommentWysiwygQuill()` — must be whitelisted or embed is stripped */
  'divider',
]

interface CommentWysiwygProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  height?: string
  bgColor?: string
  /** Ticket/todo id for image upload path: ticket/{ticketId}/{unixtime}. Omit for draft path (ticket/draft/...). */
  ticketId?: string | number
  /**
   * When true, uses Quill `getSemanticHTML()` (normalizes HTML; consecutive empty paragraphs often collapse).
   * When false (default), uses `innerHTML` so double Enter / multiple blank lines are preserved.
   * Message templates keep `false` so `{{ placeholders }}` stay literal.
   */
  useSemanticHTML?: boolean
}

export default function CommentWysiwyg({
  value = '',
  onChange,
  placeholder = 'Add a comment...',
  height = '100px',
  bgColor = 'transparent',
  ticketId,
  useSemanticHTML = false,
}: CommentWysiwygProps) {
  const { resolved } = useTheme()
  const [mounted, setMounted] = useState(false)
  const quillRef = useRef<{ getEditor: () => QuillEditor } | null>(null)
  const normalizedPlainTextForQuillRef = useRef(false)
  const ticketIdRef = useRef(ticketId)
  ticketIdRef.current = ticketId

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        [{ size: ['small', false, 'large', 'huge'] }],
        [{ color: [] }, { background: [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
        ['link', 'image'],
        ['divider'],
        ['clean'],
      ],
      handlers: {
        /** Toolbar calls `handler.call(toolbarModule, value)` — use `this.quill` (reliable; ref spread can miss). */
        divider: function dividerHandler(this: { quill: QuillFullEditor }) {
          const quill = this.quill
          const range = quill.getSelection(true)
          const index = range?.index ?? Math.max(0, quill.getLength() - 1)
          quill.insertEmbed(index, 'divider', true, 'user')
          quill.setSelection(index + 1, 0, 'user')
        },
        image: function imageHandler(this: { quill: QuillFullEditor }) {
          const quill = this.quill
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
            const idx = range?.index ?? Math.max(0, quill.getLength() - 1)
            quill.insertEmbed(idx, 'image', url, 'user')
            quill.setSelection(idx + 1, 0, 'user')
          }
          input.click()
        },
      },
    },
  }), [])

  useEffect(() => {
    registerCommentWysiwygQuill()
    setMounted(true)
  }, [])

  useEffect(() => {
    normalizedPlainTextForQuillRef.current = false
  }, [ticketId])

  /** After swap to Quill, turn multiline plain text (from fallback textarea) into <p> HTML once. */
  useEffect(() => {
    if (!mounted || !onChange || normalizedPlainTextForQuillRef.current) return
    const v = value ?? ''
    if (!v.includes('\n')) return
    if (/<[a-z][\s\S]*>/i.test(v)) return
    normalizedPlainTextForQuillRef.current = true
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = v
      .split('\n')
      .map((line) => `<p>${line ? esc(line) : '<br>'}</p>`)
      .join('')
    onChange(html)
  }, [mounted, value, onChange])

  const editorMinPx = useMemo(() => {
    if (!height) return 99
    const n = parseInt(String(height).replace('px', ''), 10)
    return Number.isFinite(n) ? Math.max(40, n - 1) : 99
  }, [height])

  // Editable fallback until ReactQuill loads (Enter / plain-text bullets work here).
  if (!mounted) {
    const parsed = height ? parseInt(height.replace('px', ''), 10) : NaN
    const minH = Number.isFinite(parsed) ? parsed : 200
    return (
      <div className="comment-wysiwyg-wrapper" style={{ marginBottom: 8 }} suppressHydrationWarning>
        <Input.TextArea
          placeholder={`${placeholder} (Enter for new lines; use - or * for bullet lines)`}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          rows={Math.max(4, Math.round(minH / 24))}
          style={{
            minHeight: minH,
            resize: 'vertical',
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}
        />
      </div>
    )
  }

  const shellBg = resolved === 'dark' ? 'transparent' : bgColor

  const quillProps = {
    theme: 'snow',
    value,
    onChange: (v: string) => onChange?.(v),
    placeholder,
    modules,
    formats: QUILL_FORMATS,
    style: { backgroundColor: shellBg, height: height },
    ref: quillRef,
    tabIndex: 10,
    useSemanticHTML,
  }
  return (
    <>
    <style>{`
      .comment-wysiwyg-wrapper {
        position: relative;
        overflow: visible;
      }
      .comment-wysiwyg-wrapper .ql-editor {
        min-height: ${editorMinPx}px;
      }
      /* Toolbar: size / color pickers need room; dropdowns above sibling controls */
      .comment-wysiwyg-wrapper .ql-toolbar.ql-snow {
        flex-wrap: wrap;
        row-gap: 4px;
      }
      .comment-wysiwyg-wrapper .ql-snow .ql-picker.ql-size {
        width: 92px;
      }
      .comment-wysiwyg-wrapper .ql-snow .ql-picker.ql-header {
        width: 108px;
      }
      /* Snow theme ships .ql-size-* on spans; reinforce in composer if theme order loads late */
      .comment-wysiwyg-wrapper .ql-editor .ql-size-small {
        font-size: 0.75em;
      }
      .comment-wysiwyg-wrapper .ql-editor .ql-size-large {
        font-size: 1.5em;
      }
      .comment-wysiwyg-wrapper .ql-editor .ql-size-huge {
        font-size: 2.5em;
      }
      .comment-wysiwyg-wrapper .ql-editor hr {
        border: none;
        border-top: 1px solid rgba(0, 0, 0, 0.12);
        margin: 0.75em 0;
        height: 0;
        padding: 0;
      }
      .comment-wysiwyg-wrapper .ql-toolbar button.ql-divider {
        width: 28px;
      }
      .comment-wysiwyg-wrapper .ql-toolbar button.ql-divider svg {
        width: 18px;
        height: 18px;
      }
    `}</style>

    <div className="comment-wysiwyg-wrapper" style={{ marginBottom: 20, height: height, }}>
      {/* ref passed for image handler; react-quill-new types omit ref */}
      <ReactQuill {...(quillProps as React.ComponentProps<typeof ReactQuill>)} />
    </div>
    </>
  )
}
