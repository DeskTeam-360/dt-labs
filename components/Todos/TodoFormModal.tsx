'use client'

import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
} from 'antd'
import type { FormInstance } from 'antd/es/form'
import { PaperClipOutlined, DeleteOutlined } from '@ant-design/icons'
import CommentWysiwyg from '../TodoDetail/CommentWysiwyg'
import type { TodoRecord, Team, UserRecord } from './types'
import type { TicketAttachment, NewTicketAttachment } from './types'

const { Option } = Select

interface TodoFormModalProps {
  open: boolean
  editingTodo: TodoRecord | null
  form: FormInstance
  teams: Team[]
  users: UserRecord[]
  ticketTypes: Array<{ id: number; title: string; color: string }>
  ticketPriorities: Array<{ id: number; title: string; slug: string; color: string }>
  companies: Array<{ id: string; name: string }>
  allTags: Array<{ id: string; name: string }>
  allStatuses: Array<{ slug: string; title: string }>
  selectedAssignees: string[]
  onSelectedAssigneesChange: (v: string[]) => void
  selectedTagIds: string[]
  onSelectedTagIdsChange: (v: string[]) => void
  ticketAttachmentsFromDb: TicketAttachment[]
  newTicketAttachments: NewTicketAttachment[]
  deletedTicketAttachmentIds: string[]
  onDeletedAttachmentIdsChange: (ids: string[] | ((prev: string[]) => string[])) => void
  onNewAttachmentsChange: (attachments: NewTicketAttachment[] | ((prev: NewTicketAttachment[]) => NewTicketAttachment[])) => void
  onFilesSelected: (files: FileList | null) => void
  onSubmit: (values: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}

export default function TodoFormModal({
  open,
  editingTodo,
  form,
  teams,
  users,
  ticketTypes,
  ticketPriorities,
  companies,
  allTags,
  allStatuses,
  selectedAssignees,
  onSelectedAssigneesChange,
  selectedTagIds,
  onSelectedTagIdsChange,
  ticketAttachmentsFromDb,
  newTicketAttachments,
  deletedTicketAttachmentIds,
  onDeletedAttachmentIdsChange,
  onNewAttachmentsChange,
  onFilesSelected,
  onSubmit,
  onCancel,
}: TodoFormModalProps) {
  return (
    <Modal
      title={editingTodo ? 'Edit Ticket' : 'Create Ticket'}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={700}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: 'Please enter ticket title!' }]}
        >
          <Input placeholder="Ticket Title" />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <CommentWysiwyg ticketId={editingTodo?.id} placeholder="Ticket Description" height="160px" />
        </Form.Item>

        <Form.Item label="Attachments">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {ticketAttachmentsFromDb
              .filter((a) => !deletedTicketAttachmentIds.includes(a.id))
              .map((a) => (
                <Space key={a.id} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PaperClipOutlined /> {a.file_name}
                  </a>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onDeletedAttachmentIdsChange((prev) => [...prev, a.id])} />
                </Space>
              ))}
            {newTicketAttachments.map((a, i) => (
              <Space key={`new-${i}`} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PaperClipOutlined /> {a.file_name}
                </a>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onNewAttachmentsChange((prev) => prev.filter((_, idx) => idx !== i))} />
              </Space>
            ))}
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              id="ticket-files-input"
              onChange={(e) => {
                onFilesSelected(e.target.files)
                e.target.value = ''
              }}
            />
            <Button icon={<PaperClipOutlined />} onClick={() => document.getElementById('ticket-files-input')?.click()}>
              Attach files
            </Button>
          </Space>
        </Form.Item>

        <Form.Item name="status" label="Status" rules={[{ required: true }]}>
          <Select>
            {allStatuses.map((s) => (
              <Option key={s.slug} value={s.slug}>
                {s.title}
              </Option>
            ))}
          </Select>
        </Form.Item>

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

        <Form.Item name="priority_id" label="Priority">
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

        <Form.Item name="company_id" label="Company">
          <Select placeholder="Select company" allowClear>
            {companies.map((c) => (
              <Option key={c.id} value={c.id}>
                {c.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

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

        <Form.Item name="visibility" label="Visibility" rules={[{ required: true }]}>
          <Select
            onChange={(value) => {
              if (value !== 'specific_users') {
                onSelectedAssigneesChange([])
              }
            }}
          >
            <Option value="private">Private</Option>
            <Option value="team">Team</Option>
            <Option value="specific_users">Specific Users</Option>
            <Option value="public">Public</Option>
          </Select>
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) =>
            prevValues.visibility !== currentValues.visibility
          }
        >
          {({ getFieldValue }) =>
            getFieldValue('visibility') === 'team' ? (
              <Form.Item name="team_id" label="Team" rules={[{ required: true }]}>
                <Select placeholder="Select Team">
                  {teams.map((team) => (
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
                  {users.map((user) => (
                    <Option key={user.id} value={user.id} label={user.full_name || user.email}>
                      {user.full_name || user.email}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            ) : null
          }
        </Form.Item>

        <Form.Item name="due_date" label="Due Date">
          <DatePicker
            style={{ width: '100%' }}
            showTime
            format="YYYY-MM-DD HH:mm"
            placeholder="Select Due Date"
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {editingTodo ? 'Update' : 'Create'}
            </Button>
            <Button onClick={onCancel}>
              Cancel
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}
