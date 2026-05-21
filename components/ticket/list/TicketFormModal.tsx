'use client'

import { DeleteOutlined,PaperClipOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Col,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useMemo,useRef } from 'react'

import CommentWysiwyg from '@/components/ticket/detail/CommentWysiwyg'

import type { Team, TicketRecord, UserRecord } from './types'
import type { NewTicketAttachment,TicketAttachment } from './types'

const { Option } = Select

interface TicketFormModalProps {
  open: boolean
  editingTicket: TicketRecord | null
  form: FormInstance
  teams: Team[]
  users: UserRecord[]
  ticketTypes: Array<{ id: number; title: string; color: string }>
  companies: Array<{ id: string; name: string }>
  allTags: Array<{ id: string; name: string }>
  allStatuses: Array<{ slug: string; title: string; is_active?: boolean }>
  selectedAssignees: string[]
  onSelectedAssigneesChange: (v: string[]) => void
  selectedTagIds: string[]
  onSelectedTagIdsChange: (v: string[]) => void
  ticketAttachmentsFromDb?: TicketAttachment[]
  newTicketAttachments?: NewTicketAttachment[]
  deletedTicketAttachmentIds?: string[]
  onDeletedAttachmentIdsChange?: (ids: string[] | ((prev: string[]) => string[])) => void
  onNewAttachmentsChange?: (attachments: NewTicketAttachment[] | ((prev: NewTicketAttachment[]) => NewTicketAttachment[])) => void
  onRemoveNewAttachment?: (attachment: NewTicketAttachment) => void
  onFilesSelected?: (files: File[] | FileList | null) => void
  attachmentUploading?: boolean
  submitting?: boolean
  onSubmit: (values: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  /** When true, show simplified form: Title, Description, Priority, Type only */
  isCustomer?: boolean
}

export default function TicketFormModal({
  open,
  editingTicket,
  form,
  teams,
  users,
  ticketTypes,
  companies,
  allTags,
  allStatuses,
  selectedAssignees,
  onSelectedAssigneesChange,
  selectedTagIds,
  onSelectedTagIdsChange,
  ticketAttachmentsFromDb = [],
  newTicketAttachments = [],
  deletedTicketAttachmentIds = [],
  onDeletedAttachmentIdsChange,
  onNewAttachmentsChange,
  onRemoveNewAttachment,
  onFilesSelected,
  attachmentUploading = false,
  submitting = false,
  onSubmit,
  onCancel,
  isCustomer = false,
}: TicketFormModalProps) {
  /** Customers always use the same compact fields as create (title, description, type, priority). */
  const showSimplifiedForm = isCustomer
  /** Customer: attachments on create + edit. Staff: attachments only when creating (full form). */
  const showAttachmentSection = showSimplifiedForm || !editingTicket
  const fileInputIdRef = useRef<string | null>(null)
  if (!fileInputIdRef.current) {
    fileInputIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `ticket-files-${crypto.randomUUID()}`
        : `ticket-files-${Math.random().toString(36).slice(2)}`
  }
  const fileInputId = fileInputIdRef.current
  const watchedContactUserId = Form.useWatch('contact_user_id', form)
  const watchedCompanyId = Form.useWatch('company_id', form)
  const contactCompanyMismatchHint = useMemo(() => {
    if (showSimplifiedForm || !open) return null
    if (!watchedContactUserId || !watchedCompanyId) return null
    const u = users.find((x) => x.id === watchedContactUserId)
    const uc = u?.company_id
    if (!uc || uc === watchedCompanyId) return null
    const otherName = companies.find((c) => c.id === uc)?.name ?? 'another company'
    return `Contact belongs to a different company (${otherName}). When the ticket is created, its company will match the contact's company (cross-company).`
  }, [showSimplifiedForm, open, watchedContactUserId, watchedCompanyId, users, companies])

  const statusOptionsForForm = useMemo(() => {
    if (!editingTicket || showSimplifiedForm) return []
    const active = allStatuses.filter((s) => s.is_active !== false)
    const cur = editingTicket.status
    if (cur && !active.some((s) => s.slug === cur)) {
      const row = allStatuses.find((s) => s.slug === cur)
      return row ? [...active, row] : active
    }
    return active
  }, [allStatuses, editingTicket, editingTicket?.status, showSimplifiedForm])

  return (
    <Modal
      title={editingTicket ? 'Edit Ticket' : 'Create Ticket'}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={showSimplifiedForm ? 720 : 1200}
      centered
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: 'Please enter ticket title!' }]}
        >
          <Input placeholder="Ticket Title" />
        </Form.Item>

        {(!editingTicket || showSimplifiedForm) && (
          <Form.Item name="description" label="Description">
            <CommentWysiwyg
              ticketId={editingTicket?.id}
              placeholder="Ticket Description"
              height="150px"
            />
          </Form.Item>
        )}

        {editingTicket && !showSimplifiedForm && (
          <Form.Item name="short_note" label="Short Note" style={{ marginTop: 50 }}>
            <Input.TextArea placeholder="Short note (optional)" rows={2} allowClear />
          </Form.Item>
        )}
        <br />
        {showAttachmentSection && (
          <Form.Item label="Attachments">
            <Flex vertical style={{ width: '100%' }}>
              {ticketAttachmentsFromDb
                .filter((a) => !deletedTicketAttachmentIds.includes(a.id))
                .map((a) => (
                  <Space key={a.id} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PaperClipOutlined /> {a.file_name}
                    </a>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDeletedAttachmentIdsChange?.((prev) => [...prev, a.id])} />
                  </Space>
                ))}
              {newTicketAttachments.map((a, i) => (
                <Space key={`new-${i}`} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 5 }}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PaperClipOutlined /> {a.file_name}
                  </a>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => (onRemoveNewAttachment ? onRemoveNewAttachment(a) : onNewAttachmentsChange?.((prev) => prev.filter((_, idx) => idx !== i)))}
                  />
                </Space>
              ))}
              <input
                type="file"
                multiple
                style={{ display: 'none' }}
                id={fileInputId}
                onChange={(e) => {
                  const fileList = e.target.files
                  const filesArray = fileList ? Array.from(fileList) : []
                  e.target.value = ''
                  onFilesSelected?.(filesArray.length ? filesArray : null)
                }}
              />
              <Button
                icon={<PaperClipOutlined />}
                onClick={() => document.getElementById(fileInputId)?.click()}
                loading={attachmentUploading}
              >
                Attach files
              </Button>
            </Flex>
          </Form.Item>
        )}

        <Row gutter={24}>
          {editingTicket && !showSimplifiedForm ? (
            <Col span={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select>
                  {statusOptionsForForm.map((s) => (
                    <Option key={s.slug} value={s.slug}>
                      {s.title}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          ) : null}
          <Col span={showSimplifiedForm ? 12 : editingTicket ? 8 : 12}>
            <Form.Item name="type_id" label="Type">
              <Select placeholder="Select type" allowClear>
                {ticketTypes.map((t) => (
                  <Option key={t.id} value={t.id}>
                    <Space>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          backgroundColor: t.color,
                        }}
                      />
                      {t.title}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={showSimplifiedForm ? 12 : editingTicket ? 8 : 12}>
            <Form.Item
              name="priority"
              label="Priority"
              tooltip={
                showSimplifiedForm
                  ? '0 or empty appends the ticket to the back of the queue (the slot is assigned automatically—we do not store 0). Other numbers define order; within one company each support ticket has a distinct priority (1, 2, 3 …).'
                  : 'For support tickets per company: each priority number is unique (1 is first, and so on). 0 means append at the end of that company’s queue.'
              }
              rules={[{ required: true, message: 'Enter a priority number' }]}
            >
              <InputNumber min={0} precision={0} placeholder="0 = end of queue; 1, 2 …" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          {!showSimplifiedForm && (
            <>
              <Col span={12}>
                <Form.Item name="company_id" label="Company">
                  <Select placeholder="Select company" 
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={companies.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  >
                    {companies.map((c) => (
                      <Option key={c.id} value={c.id} label={c.name}>
                        {c.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Tags">
                  <Select
                    mode="multiple"
                    placeholder="Select tags"
                    value={selectedTagIds}
                    onChange={onSelectedTagIdsChange}
                    optionLabelProp="label"
                    allowClear
                  >
                    {allTags.map((t) => (
                      <Option key={t.id} value={t.id} label={t.name}>
                        {t.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </>
          )}
        </Row>

<Row gutter={24}>
  <Col span={12}>
        {!showSimplifiedForm && (
          <Form.Item
            name="contact_user_id"
            label="Contact (email replies)"
            tooltip="Optional. When set, customer replies from the portal go to this user; agent email replies use their address. Defaults to creator."
          >
            <Select
              placeholder="Same as creator (logged-in user)"
              allowClear
              showSearch
              optionFilterProp="label"
              options={users
                .filter((u) => String(u.email || '').trim())
                .map((u) => ({
                  value: u.id,
                  label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
                }))}
            />
          </Form.Item>
        )}

        {!showSimplifiedForm && contactCompanyMismatchHint ? (
          <Alert type="warning" showIcon message={contactCompanyMismatchHint} style={{ marginBottom: 16 }} />
        ) : null}
        </Col>
        <Col span={12}>

        {!showSimplifiedForm && (
          <>
            <Form.Item
              name="team_id"
              label="Team"
              tooltip="Optional. Set when the ticket is tied to a team; newly created tickets are always public."
            >
              <Select placeholder="No team" allowClear showSearch optionFilterProp="label">
                {teams.map((t) => (
                  <Option key={t.id} value={t.id} label={t.name}>
                    {t.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>

           
          </>
        )}
        </Col>
        </Row>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {editingTicket ? 'Update' : 'Create'}
            </Button>
            <Button onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}
