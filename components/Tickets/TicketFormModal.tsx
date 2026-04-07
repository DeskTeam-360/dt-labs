'use client'

import { useRef } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  Col,
  Row,
  Flex,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import { PaperClipOutlined, DeleteOutlined } from '@ant-design/icons'
import CommentWysiwyg from '../TicketDetail/CommentWysiwyg'
import type { TicketRecord, Team, UserRecord } from './types'
import type { TicketAttachment, NewTicketAttachment } from './types'

const { Option } = Select

interface TicketFormModalProps {
  open: boolean
  editingTicket: TicketRecord | null
  form: FormInstance
  teams: Team[]
  users: UserRecord[]
  currentUserId?: string
  userTeamIds?: string[]
  ticketTypes: Array<{ id: number; title: string; color: string }>
  ticketPriorities: Array<{ id: number; title: string; slug: string; color: string }>
  companies: Array<{ id: string; name: string }>
  allTags: Array<{ id: string; name: string }>
  allStatuses: Array<{ slug: string; title: string }>
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
  currentUserId,
  userTeamIds = [],
  ticketTypes,
  ticketPriorities,
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
  const selectableTeams = userTeamIds.length > 0 ? teams.filter((t) => userTeamIds.includes(t.id)) : []

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
          {!showSimplifiedForm && (
            <Col span={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select>
                  {allStatuses.map((s) => (
                    <Option key={s.slug} value={s.slug}>
                      {s.title}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          )}
          <Col span={showSimplifiedForm ? 12 : 8}>
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

          <Col span={showSimplifiedForm ? 12 : 8}>
            <Form.Item
              name="priority_id"
              label="Priority"
              rules={[{ required: true, message: 'Please select priority!' }]}
            >
              <Select placeholder="Select priority" allowClear>
                {ticketPriorities.map((p) => (
                  <Option key={p.id} value={p.id}>
                    <Space>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          backgroundColor: p.color,
                        }}
                      />
                      {p.title}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          {!showSimplifiedForm && (
            <>
              <Col span={12}>
                <Form.Item name="company_id" label="Company">
                  <Select placeholder="Select company" allowClear>
                    {companies.map((c) => (
                      <Option key={c.id} value={c.id}>
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

        {!showSimplifiedForm && (
          <>


            <Form.Item name="visibility" label="Visibility" rules={[{ required: true }]}>
              <Select
                onChange={(value) => {
                  if (value !== 'specific_users') {
                    onSelectedAssigneesChange([])
                  } else if (currentUserId && !selectedAssignees.includes(currentUserId)) {
                    onSelectedAssigneesChange([currentUserId, ...selectedAssignees])
                  }
                }}
              >
                <Option value="public">Public</Option>
                <Option value="team">Team</Option>
                <Option value="specific_users">Specific Users</Option>

              </Select>
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.visibility !== currentValues.visibility
              }
            >
              {({ getFieldValue }) =>
                (getFieldValue('visibility') === 'team' || getFieldValue('visibility') === 'public') ? (
                  <Form.Item
                    name="team_id"
                    label="Team"
                    rules={[{ required: getFieldValue('visibility') === 'team', message: 'Please select team!' }]}
                  >
                    <Select placeholder="Select Team">
                      {selectableTeams.map((team) => (
                        <Option key={team.id} value={team.id}>
                          {team.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                ) : null
              }
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.visibility !== currentValues.visibility
              }
            >
              {({ getFieldValue }) =>
                getFieldValue('visibility') === 'specific_users' ? (
                  <Form.Item
                    label="Assign To Users"
                    required
                    validateStatus={
                      getFieldValue('visibility') === 'specific_users' && selectedAssignees.length === 0
                        ? 'error'
                        : ''
                    }
                    help={
                      getFieldValue('visibility') === 'specific_users' && selectedAssignees.length === 0
                        ? 'Please select at least one user!'
                        : ''
                    }
                  >
                    <Select
                      mode="multiple"
                      placeholder="Select Users"
                      value={selectedAssignees}
                      onChange={onSelectedAssigneesChange}
                      optionLabelProp="label"
                    >
                      {users
                        .filter((u) => (u.role ?? '').toLowerCase() !== 'customer')
                        .map((user) => (
                          <Option key={user.id} value={user.id} label={user.full_name || user.email}>
                            {user.full_name || user.email}
                          </Option>
                        ))}
                    </Select>
                  </Form.Item>
                ) : null
              }
            </Form.Item>


          </>
        )}

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
