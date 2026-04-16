'use client'

import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  ForwardFilled,
  MessageOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Flex,
  Input,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo,useState } from 'react'

import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'

import DateDisplay from '../DateDisplay'
import CommentComposer from './CommentComposer'
import CommentTaggedCcLines from './CommentTaggedCcLines'
import CommentWysiwyg from './CommentWysiwyg'
import TicketUserMention from './TicketUserMention'

const { Text, Paragraph } = Typography

interface ChecklistItem {
  id: string
  ticket_id: number
  title: string
  is_completed: boolean
  order_index: number
  created_at: string
}

interface CommentAttachment { id: string; file_url: string; file_name: string }
interface Comment {
  id: string
  ticket_id: number
  user_id: string
  comment: string
  created_at: string
  visibility?: 'note' | 'reply'
  author_type?: 'customer' | 'agent' | 'automation'
  user?: { id: string; full_name: string | null; email: string; avatar_url?: string | null }
  comment_attachments?: CommentAttachment[] | null
  tagged_user_ids?: string[]
  tagged_users?: { id: string; full_name: string | null; email: string }[]
  cc_emails?: string[]
  bcc_emails?: string[]
}

interface Attribute {
  id: string
  ticket_id: number
  meta_key: string
  meta_value: string | null
  created_at: string
  updated_at: string
}

interface StatusOption {
  slug: string
  title: string
  color: string
  /** false = inactive (hidden from this select except current ticket status) */
  is_active?: boolean
}

interface TicketAttachment { id: string; file_url: string; file_name: string; file_path?: string }
interface TabGeneralProps {
  ticketData: any
  ticketAttachments?: TicketAttachment[]
  getStatusColor: (status: string) => string
  getStatusLabel: (status: string) => string
  statusOptions: StatusOption[]
  onStatusChange: (newStatus: string) => void | Promise<void>
  statusChanging?: boolean
  typeOptions: { id: number; title: string; slug: string; color: string }[]
  onTypeChange: (typeId: number | null) => void | Promise<void>
  typeChanging?: boolean
  priorityOptions: { id: number; title: string; slug: string; color: string }[]
  onPriorityChange: (priorityId: number | null) => void | Promise<void>
  priorityChanging?: boolean
  companyOptions: { id: string; name: string }[]
  onCompanyChange: (companyId: string | null) => void | Promise<void>
  companyChanging?: boolean
  tagOptions: { id: string; name: string; slug: string }[]
  selectedTagIds: string[]
  onTagsChange: (tagIds: string[]) => void | Promise<void>
  tagsChanging?: boolean
  /** When false, company and tags are read-only (customer view) */
  canEditCompanyAndTags?: boolean
  onDueDateChange?: (dueDate: string | null) => void | Promise<void>
  dueDateChanging?: boolean
  visibilityOptions: { value: string; label: string }[]
  selectedVisibility: string
  onVisibilityChange: (visibility: string) => void | Promise<void>
  visibilityChanging?: boolean
  teamOptions: { id: string; name: string }[]
  selectedTeamId: string | null
  onTeamChange: (teamId: string | null) => void | Promise<void>
  teamChanging?: boolean
  assigneeOptions: { id: string; full_name: string | null; email: string }[]
  selectedAssigneeIds: string[]
  onAssigneesChange: (userIds: string[]) => void | Promise<void>
  assigneesChanging?: boolean
  canEditAssignees?: boolean
  shortNote?: string | null
  onShortNoteChange?: (value: string | null) => void | Promise<void>
  shortNoteChanging?: boolean
  totalTimeSeconds: number
  activeTimeTracker: any
  currentTime: number
  formatTime: (seconds: number) => string
  checklistItems: ChecklistItem[]
  totalChecklistCount: number
  completedChecklistCount: number
  newChecklistTitle: string
  onNewChecklistTitleChange: (v: string) => void
  onAddChecklistItem: () => void
  onToggleChecklistItem: (itemId: string, isCompleted: boolean) => void
  onDeleteChecklistItem: (itemId: string) => void
  comments: Comment[]
  currentUserId: string
  editingComment: string | null
  editingCommentValue: string
  onEditComment: (commentId: string, value: string) => void
  onEditingCommentValueChange: (v: string) => void
  onSaveEditComment: (commentId: string) => void
  onCancelEditComment: () => void
  onDeleteComment: (commentId: string) => void
  canDeleteComment: (createdAt: string) => boolean
  onAddComment: (
    commentText: string,
    attachments: { url: string; file_name: string; file_path: string }[],
    extra?: { taggedUserIds?: string[]; ccEmails?: string[]; bccEmails?: string[] }
  ) => Promise<void>
  addCommentLoading?: boolean
  commentsHasOlder?: boolean
  commentsOlderRemaining?: number
  onLoadMoreComments?: () => void | Promise<void>
  loadMoreCommentsLoading?: boolean
  commentVisibility?: 'note' | 'reply' | null
  onCommentVisibilityChange?: (v: 'note' | 'reply') => void
  showNoteOption?: boolean
  nonCustomerUsers?: Array<{ id: string; full_name?: string | null; email: string }>
  companyCustomers?: Array<{ id: string; full_name: string | null; email: string }>
  /** Emails ever CC'd on this ticket - pre-fill CC on replies */
  ticketCcEmails?: string[]
  attributes: Attribute[]
  newAttributeKey: string
  newAttributeValue: string
  onNewAttributeKeyChange: (v: string) => void
  onNewAttributeValueChange: (v: string) => void
  onAddAttribute: () => void
  editingAttribute: string | null
  onEditingAttributeChange: (id: string | null) => void
  onUpdateAttribute: (attributeId: string, newValue: string) => void
  onDeleteAttribute: (attributeId: string) => void
  attributesLoading: boolean
}

export default function TabGeneral({
  ticketData,
  ticketAttachments = [],
  getStatusColor,
  getStatusLabel,
  statusOptions,
  onStatusChange,
  statusChanging = false,
  typeOptions,
  onTypeChange,
  typeChanging = false,
  priorityOptions,
  onPriorityChange,
  priorityChanging = false,
  companyOptions,
  onCompanyChange,
  companyChanging = false,
  tagOptions,
  selectedTagIds,
  onTagsChange,
  tagsChanging = false,
  canEditCompanyAndTags = true,
  onDueDateChange,
  dueDateChanging = false,
  visibilityOptions,
  selectedVisibility,
  onVisibilityChange,
  visibilityChanging = false,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamChanging = false,
  assigneeOptions,
  selectedAssigneeIds,
  onAssigneesChange,
  assigneesChanging = false,
  canEditAssignees = true,
  shortNote,
  onShortNoteChange,
  shortNoteChanging = false,
  totalTimeSeconds,
  activeTimeTracker,
  currentTime,
  formatTime,
  checklistItems,
  totalChecklistCount,
  completedChecklistCount,
  newChecklistTitle,
  onNewChecklistTitleChange,
  onAddChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  comments,
  currentUserId,
  editingComment,
  editingCommentValue,
  onEditComment,
  onEditingCommentValueChange,
  onSaveEditComment,
  onCancelEditComment,
  onDeleteComment,
  canDeleteComment,
  onAddComment,
  addCommentLoading = false,
  commentsHasOlder = false,
  commentsOlderRemaining = 0,
  onLoadMoreComments,
  loadMoreCommentsLoading = false,
  commentVisibility = null,
  onCommentVisibilityChange = () => {},
  showNoteOption = false,
  nonCustomerUsers = [],
  companyCustomers = [],
  ticketCcEmails = [],
  attributes,
  newAttributeKey,
  newAttributeValue,
  onNewAttributeKeyChange,
  onNewAttributeValueChange,
  onAddAttribute,
  editingAttribute,
  onEditingAttributeChange,
  onUpdateAttribute,
  onDeleteAttribute,
  attributesLoading,
}: TabGeneralProps) {
  const [shortNoteInput, setShortNoteInput] = useState(shortNote ?? '')
  useEffect(() => {
    setShortNoteInput(shortNote ?? '')
  }, [shortNote])

  const statusSelectOptions = useMemo(() => {
    const cur = ticketData?.status as string | undefined
    const active = statusOptions.filter((s) => s.is_active !== false)
    if (cur && !active.some((s) => s.slug === cur)) {
      const row = statusOptions.find((s) => s.slug === cur)
      return row ? [...active, row] : active
    }
    return active
  }, [statusOptions, ticketData?.status])

  const creatorId = ticketData.creator?.id ?? ticketData.created_by ?? null
  const creatorEmail = ticketData.creator?.email ?? null
  /** Thread header: company + person when both exist (portal context). */
  const creatorLabel =
    [ticketData.company?.name, ticketData.creator?.full_name || ticketData.creator?.email].filter(Boolean).join(' · ') ||
    ticketData.creator?.full_name ||
    ticketData.creator?.email ||
    ticketData.company?.name ||
    'Unknown'
  /** Sidebar "Created By": person under company ticket only (company has its own row). */
  const createdByPersonLabel =
    ticketData.creator?.full_name || ticketData.creator?.email || '—'

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={[24, 24]}>
      <Col xs={16}>


      <Flex gap="middle" align="flex-start" style={{ padding: 10, marginBottom: 10, borderBottom: '1px solid var(--ticket-thread-divider)' }}>
                      <TicketUserMention userId={creatorId} email={creatorEmail}>
                        <Avatar style={{ cursor: creatorId ? 'pointer' : undefined }} icon={<UserOutlined />} src={ticketData.creator?.avatar_url} />
                      </TicketUserMention>
                      <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                        <Flex justify="space-between" align="center" wrap="wrap" gap="small">
                          <Space>
                            <TicketUserMention userId={creatorId} email={creatorEmail}>
                              <Text strong style={{ cursor: creatorId ? 'pointer' : undefined }}>
                                {creatorLabel}
                              </Text>
                            </TicketUserMention>
                            <Text style={{ fontSize: 12, color: 'var(--ticket-thread-meta)' }}>
                              <DateDisplay date={ticketData.created_at} />
                            </Text>
                          </Space>
                         
                        </Flex>
                       
                            <div
                              className="ql-editor comment-html"
                              style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
                              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(ticketData.description) }}
                            />
                            {ticketAttachments.length > 0 && (
                              <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                                {ticketAttachments.map((att) => (
                                  <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <PaperClipOutlined /> {att.file_name}
                                  </a>
                                ))}
                              </Flex>
                            )}
                      </Flex>
                    </Flex>

            <div style={{ padding: '0 16px', marginTop: 8, marginBottom: 4, textAlign: 'center' }}>
              {commentsHasOlder ? (
                <Button
                  type="link"
                  loading={loadMoreCommentsLoading}
                  onClick={() => onLoadMoreComments?.()}
                  style={{ border: '1px solid #d9d9d9', borderRadius: 20, padding: '10px 20px' }}
                >
                  {commentsOlderRemaining > 0 ? ` (+${commentsOlderRemaining} Conversations)` : ''}
                </Button>
              ) : null}
            </div>
          
            <Flex orientation="vertical" style={{ width: '100%', padding: 16 }} gap={30}>
              {comments.length > 0 ? (
                <Flex vertical gap={10}>
                  {comments.map((comment) => {
                    const isAutomation = comment.author_type === 'automation'
                    const isCustomer = comment.author_type === 'customer'
                    const isCurrentUser = comment.user_id === currentUserId
                    const borderColor = isAutomation
                      ? 'var(--ticket-thread-border-automation)'
                      : isCustomer
                        ? 'var(--ticket-thread-border-customer)'
                        : comment.visibility === 'note'
                          ? 'var(--ticket-thread-border-agent-note)'
                          : 'var(--ticket-thread-border-agent-reply)'
                    /** Per-side borders: `border` shorthand + only left/right override can drop other sides in some layouts. */
                    const outline = 'var(--ticket-thread-bubble-outline)'
                    const threadBubbleBorder = isCurrentUser
                      ? {
                          borderTop: `1px solid ${outline}`,
                          borderBottom: `1px solid ${outline}`,
                          borderLeft: `1px solid ${outline}`,
                          borderRight: '5px solid #52c41a',
                        }
                      : {
                          borderTop: `1px solid ${outline}`,
                          borderBottom: `1px solid ${outline}`,
                          borderRight: `1px solid ${outline}`,
                          borderLeft: `5px solid ${borderColor}`,
                        }
                    const authorLabel = isAutomation
                      ? 'Automation'
                      : isCustomer
                        ? (ticketData.company?.name || 'Customer') + ' - ' + (comment.user?.full_name || comment.user?.email || 'Unknown')
                        : comment.user?.full_name || comment.user?.email || 'Unknown'
                    const threadRole = isAutomation
                      ? 'automation'
                      : isCustomer
                        ? 'customer'
                        : comment.visibility === 'note'
                          ? 'agent-note'
                          : 'agent-reply'
                    const threadBgVar =
                      threadRole === 'automation'
                        ? 'var(--ticket-thread-bubble-automation)'
                        : threadRole === 'customer'
                          ? 'var(--ticket-thread-bubble-customer)'
                          : threadRole === 'agent-note'
                            ? 'var(--ticket-thread-bubble-agent-note)'
                            : 'var(--ticket-thread-bubble-agent-reply)'
                    return (
                    <div
                      key={comment.id}
                      className={`ticket-thread-bubble ticket-thread-bubble--${threadRole}`}
                      style={{
                        padding: 20,
                        borderRadius: 10,
                        color: 'var(--ticket-thread-text)',
                        backgroundColor: threadBgVar,
                        ...threadBubbleBorder,
                      }}
                    >
                    <Flex gap="middle" align="flex-start" style={{ width: '100%' }}>
                      {isAutomation ? (
                        <Avatar style={{ backgroundColor: '#722ed1' }} icon={<ThunderboltOutlined />} />
                      ) : (
                        <TicketUserMention userId={comment.user_id} email={comment.user?.email}>
                          <Avatar
                            style={{ cursor: comment.user_id ? 'pointer' : undefined }}
                            icon={<UserOutlined />}
                            src={comment.user?.avatar_url}
                          />
                        </TicketUserMention>
                      )}
                      <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                        <Flex justify="space-between" align="center" wrap="wrap" gap="small">
                          <Space>
                          {isAutomation ? (
                            <Text strong style={{ color: 'var(--ticket-thread-text)' }}>
                              {authorLabel}
                            </Text>
                          ) : (
                            <TicketUserMention userId={comment.user_id} email={comment.user?.email}>
                              <Text
                                strong
                                style={{ cursor: comment.user_id ? 'pointer' : undefined, color: 'var(--ticket-thread-text)' }}
                              >
                                {authorLabel}
                              </Text>
                            </TicketUserMention>
                          )}
                            {isAutomation ? (
                              <Tag color="purple">Automation</Tag>
                            ) : (
                              <Tag color={isCustomer ? 'cyan' : 'gold'}>{isCustomer ? 'Customer' : 'Agent'}</Tag>
                            )}
                            {showNoteOption && (
                              <Tag color={comment.visibility === 'note' ? 'default' : 'blue'}>
                                {comment.visibility === 'note' ? 'Note' : 'Reply'}
                              </Tag>
                            )}
                            <Text style={{ fontSize: 12, color: 'var(--ticket-thread-meta)' }}>
                              <DateDisplay date={comment.created_at} />
                            </Text>
                          </Space>
                          {!isAutomation && !isCustomer && comment.user_id === currentUserId && editingComment !== comment.id && (
                            <Space>
                              
                              {canDeleteComment(comment.created_at) && (
                                <>
                                <Button
                                icon={<EditOutlined />}
                                size="middle"
                                onClick={() => {
                                  onEditComment(comment.id, comment.comment)
                                }}
                              />
                              <Popconfirm
                                  title="Delete comment"
                                  description="Are you sure?"
                                  onConfirm={() => onDeleteComment(comment.id)}
                                  okText="Yes"
                                  cancelText="No"
                                >
                                  <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    size="middle"
                                  />
                                </Popconfirm>
                                </>
                                
                              )}
                            </Space>
                          )}
                        </Flex>
                        <CommentTaggedCcLines
                          tagged_users={comment.tagged_users}
                          tagged_user_ids={comment.tagged_user_ids}
                          cc_emails={comment.cc_emails}
                          bcc_emails={comment.bcc_emails}
                          resolveUser={(id) => {
                            const u =
                              nonCustomerUsers?.find((x) => x.id === id) ||
                              assigneeOptions?.find((x) => x.id === id) ||
                              companyCustomers?.find((x) => x.id === id)
                            if (!u) return null
                            return { email: u.email, label: u.full_name || u.email }
                          }}
                        />
                        <Space orientation="vertical" size="small" style={{ width: '100%', marginTop: 4 }}>
                        
                          {editingComment === comment.id ? (
                            <Flex vertical gap={40} style={{ width: '100%' }}>
                              <CommentWysiwyg
                                ticketId={ticketData?.id}
                                value={editingCommentValue}
                                onChange={onEditingCommentValueChange}
                                height="200px"
                              />
                              <Space>
                                <Button
                                  type="primary"
                                  
                                  onClick={() => onSaveEditComment(comment.id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  
                                  onClick={onCancelEditComment}
                                >
                                  Cancel
                                </Button>
                              </Space>
                            </Flex>
                          ) : comment.comment && /<[a-z][\s\S]*>/i.test(comment.comment) ? (
                            <div
                              className="ql-editor comment-html"
                              style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14, border: 'none' }}
                              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(comment.comment) }}
                            />
                          ) : (
                            <Paragraph style={{ margin: 0, color: 'var(--ticket-thread-text)' }}>{comment.comment}</Paragraph>
                          )}
                        {comment.comment_attachments?.length ? (
                          <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                            {comment.comment_attachments.map((att) => (
                                <a key={att.id || att.file_url} href={att.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <PaperClipOutlined /> {att.file_name}
                                </a>
                              ))}
                            </Flex>
                          ) : null}
                        </Space>
                      </Flex>
                    </Flex>
                    </div>
                    )
                  })}
                </Flex>
              ) : (
                <Empty description="No comments" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
              
              <CommentComposer
                ticketId={ticketData?.id ?? 0}
                companyName={ticketData?.company?.name ?? 'unknown'}
                onAddComment={onAddComment}
                loading={addCommentLoading}
                commentVisibility={commentVisibility}
                onCommentVisibilityChange={onCommentVisibilityChange}
                showNoteOption={showNoteOption ?? false}
                nonCustomerUsers={nonCustomerUsers}
                companyCustomers={companyCustomers}
                ticketCcEmails={ticketCcEmails}
              />
            </Flex>
          {/* </Card> */}
        </Col>

        <Col xs={8}>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Short Note">
              {onShortNoteChange ? (
                <Input.TextArea
                  value={shortNoteInput}
                  onChange={(e) => setShortNoteInput(e.target.value)}
                  onBlur={() => {
                    const val = shortNoteInput.trim() || null
                    if (val !== (shortNote ?? '')) onShortNoteChange(val)
                  }}
                  placeholder="Short note (optional)"
                  rows={2}
                  disabled={shortNoteChanging}
                  style={{ resize: 'vertical' }}
                />
              ) : (
                <Text>{shortNote || '—'}</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Select

                value={ticketData.status ?? undefined}
                onChange={(value) => value && onStatusChange(value)}
                loading={statusChanging}
                options={statusSelectOptions.map((s) => ({
                  value: s.slug,
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag color={s.color} style={{ margin: 0 }}>{s.title}</Tag>
                    </span>
                  ),
                }))}
                style={{ minWidth: 140, width: '100%' }}
                allowClear={false}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              <Select
                value={ticketData.type_id ?? undefined}
                onChange={(v) => onTypeChange(v ?? null)}
                loading={typeChanging}
                options={typeOptions.map((t) => ({
                  value: t.id,
                  label: <Tag color={t.color} style={{ margin: 0 }}>{t.title}</Tag>,
                }))}
                style={{ minWidth: 140, width: '100%' }}
                allowClear
                placeholder="Select type"
              />
            </Descriptions.Item>
            <Descriptions.Item label="Priority">
              <Select
                value={ticketData.priority_id ?? undefined}
                onChange={(v) => onPriorityChange(v ?? null)}
                loading={priorityChanging}
                options={priorityOptions.map((p) => ({
                  value: p.id,
                  label: <Tag color={p.color} style={{ margin: 0 }}>{p.title}</Tag>,
                }))}
                style={{ minWidth: 140, width: '100%' }}
                allowClear
                placeholder="Select priority"
              />
            </Descriptions.Item>
            <Descriptions.Item label="Company">
              {canEditCompanyAndTags ? (
                <Select
                  value={ticketData.company_id ?? undefined}
                  onChange={(v) => onCompanyChange(v ?? null)}
                  loading={companyChanging}
                  options={companyOptions.map((c) => ({ value: c.id, label: c.name }))}
                  style={{ minWidth: 140, width: '100%' }}
                  allowClear
                  placeholder="Select company"
                />
              ) : (
                <Text>{companyOptions.find((c) => c.id === ticketData.company_id)?.name ?? (ticketData.company?.name || '—')}</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Tags">
              {canEditCompanyAndTags ? (
                <Select
                  mode="multiple"
                  value={selectedTagIds}
                  onChange={(v) => onTagsChange(v ?? [])}
                  loading={tagsChanging}
                  options={tagOptions.map((t) => ({ value: t.id, label: t.name }))}
                  style={{ minWidth: 160, width: '100%' }}
                  placeholder="Select tags"
                  allowClear
                />
              ) : (
                <Text>
                  {selectedTagIds.length > 0
                    ? tagOptions.filter((t) => selectedTagIds.includes(t.id)).map((t) => t.name).join(', ')
                    : '—'}
                </Text>
              )}
            </Descriptions.Item>
            {ticketData.company_id ? (
              <Descriptions.Item label="Created By">
                <TicketUserMention userId={creatorId} email={creatorEmail}>
                  <Space style={{ cursor: creatorId ? 'pointer' : undefined }}>
                    <UserOutlined />
                    <Text>{creatorLabel}</Text> 
                  </Space>
                </TicketUserMention>
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label="CC Recipients">
              {ticketCcEmails?.length ? (
                <Text style={{ fontSize: 12 }}>{ticketCcEmails.join(', ')}</Text>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Due Date">
              {onDueDateChange ? (
                <DatePicker
                  value={ticketData.due_date ? dayjs(ticketData.due_date) : null}
                  onChange={(d) => onDueDateChange(d ? d.toISOString() : null)}
                  allowClear
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: '100%' }}
                  disabled={dueDateChanging}
                />
              ) : ticketData.due_date ? (
                <Space>
                  <ClockCircleOutlined />
                  <DateDisplay date={ticketData.due_date} />
                </Space>
              ) : (
                <Text type="secondary">No due date</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Visibility">
              {canEditAssignees ? (
                <Select
                  value={selectedVisibility}
                  onChange={(v) => v && onVisibilityChange(v)}
                  loading={visibilityChanging}
                  options={visibilityOptions}
                  style={{ minWidth: 140, width: '100%' }}
                />
              ) : (
                <Text>{visibilityOptions.find((o) => o.value === ticketData.visibility)?.label ?? ticketData.visibility}</Text>
              )}
            </Descriptions.Item>
            {selectedVisibility === 'team' || selectedVisibility === 'public' ? (
              <Descriptions.Item label="Team">
                {canEditAssignees ? (
                  <Select
                    value={selectedTeamId ?? undefined}
                    onChange={(v) => onTeamChange(v ?? null)}
                    loading={teamChanging}
                    options={teamOptions.map((t) => ({ value: t.id, label: t.name }))}
                    style={{ minWidth: 140, width: '100%' }}
                    placeholder="Select team"
                    allowClear
                  />
                ) : (
                  <Text>{ticketData.team?.name ?? '—'}</Text>
                )}
              </Descriptions.Item>
            ) : selectedVisibility === 'specific_users' ? (
              <Descriptions.Item label="Assignees">
                {canEditAssignees ? (
                  <Select
                    mode="multiple"
                    value={selectedAssigneeIds}
                    onChange={(v) => onAssigneesChange(v ?? [])}
                    loading={assigneesChanging}
                    options={assigneeOptions.map((u) => ({
                      value: String(u.id),
                      label: String(u.full_name || u.email || u.id || 'Unknown'),
                    }))}
                    style={{ minWidth: 160, width: '100%' }}
                    placeholder="Select assignees"
                    allowClear
                    showSearch
                    filterOption={(input, option) => {
                      const label = option?.label
                      if (label == null) return false
                      return String(label).toLowerCase().includes(input.toLowerCase())
                    }}
                    optionFilterProp="label"
                    dropdownStyle={{ maxHeight: 280 }}
                    getPopupContainer={(node) => node.parentElement || document.body}
                  />
                ) : (
                  <Space wrap size={4}>
                    {ticketData.assignees?.length > 0 ? (
                      ticketData.assignees.map((a: any) => (
                        <Text key={a.id}>{a.user?.full_name || a.user?.email || '—'}</Text>
                      ))
                    ) : (
                      <Text type="secondary">—</Text>
                    )}
                  </Space>
                )}
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label="Created At">
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={ticketData.created_at} />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Updated At">
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={ticketData.updated_at} />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Total Time Tracked">
              <Space>
                <ClockCircleOutlined />
                <Text strong>{formatTime(totalTimeSeconds + (activeTimeTracker ? currentTime : 0))}</Text>
              </Space>
            </Descriptions.Item>{attributes.length > 0 ? (
                <>{attributes.map((attr) => (
                    <Descriptions.Item
                      key={attr.id}
                      label={
                        <Flex style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text strong>{attr.meta_key}</Text>
                          <Flex gap={5}>
                            
                          </Flex>
                        </Flex>
                      }
                    >
                      <Flex justify="space-between" align="center">
                        
                      {editingAttribute === attr.id ? (
                        <Flex style={{ width: '100%' }}>
                          <Input
                            defaultValue={attr.meta_value || ''}
                            onPressEnter={(e) => {
                              onUpdateAttribute(attr.id, e.currentTarget.value)
                            }}
                            onBlur={(e) => {
                              onUpdateAttribute(attr.id, e.target.value)
                            }}
                            autoFocus
                            style={{ width: '100%' }}
                          />
                        </Flex>
                      ) : (
                        <Text>{attr.meta_value || <Text type="secondary">(empty)</Text>}</Text>
                      )}

{editingAttribute === attr.id ? (
                              <Button
                                type="text"
                                size="small"
                                onClick={() => onEditingAttributeChange(null)}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <Flex gap={5}>
                                <Button
                                  type="text"
                                  icon={<EditOutlined />}
                                  size="middle"
                                  onClick={() => onEditingAttributeChange(attr.id)}
                                />
                                <Popconfirm
                                  title="Delete attribute"
                                  description="Are you sure?"
                                  onConfirm={() => onDeleteAttribute(attr.id)}
                                  okText="Yes"
                                  cancelText="No"
                                >
                                  <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    size="middle"
                                  />
                                </Popconfirm>
                              </Flex>
                            )}
                      </Flex>
                    </Descriptions.Item>
                  ))}
                </>
              ) : (
                <></>
              )}
          {/* Input fields for adding a new attribute */}
          
          <Descriptions.Item label="Add new attribute">
            <Flex  align="center" style={{ width: '100%' }} gap={10}>
              <Input
                placeholder="Key"
                value={newAttributeKey}
                onChange={e => onNewAttributeKeyChange(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <Input
                placeholder="Value"
                value={newAttributeValue}
                onChange={e => onNewAttributeValueChange(e.target.value)}
                onPressEnter={onAddAttribute}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onAddAttribute}
                disabled={!newAttributeKey.trim()}
                loading={attributesLoading}
              >
                Add
              </Button>
            </Flex>
          </Descriptions.Item>
          </Descriptions>
          <br />

          <Card
            title={
              <Space>
                <CheckCircleOutlined />
                <Text strong>Checklist</Text>
                {totalChecklistCount > 0 && (
                  <Text type="secondary">
                    ({completedChecklistCount}/{totalChecklistCount})
                  </Text>
                )}
              </Space>
            }
            size="small"
          >
            <Space orientation="vertical" style={{ width: '100%' }} size="middle">
              {checklistItems.length > 0 ? (
                <Flex vertical gap="small">
                  {checklistItems.map((item: ChecklistItem) => (
                    <Flex
                      key={item.id}
                      align="center"
                      justify="space-between"
                      style={{
                        padding: '8px 0',
                        textDecoration: item.is_completed ? 'line-through' : 'none',
                        opacity: item.is_completed ? 0.6 : 1,
                      }}
                    >
                      <Checkbox
                        checked={item.is_completed}
                        onChange={() => onToggleChecklistItem(item.id, item.is_completed)}
                      >
                        <Text>{item.title}</Text>
                      </Checkbox>
                      <Popconfirm
                        title="Delete checklist item"
                        description="Are you sure?"
                        onConfirm={() => onDeleteChecklistItem(item.id)}
                        okText="Yes"
                        cancelText="No"
                      >
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          size="middle"
                        />
                      </Popconfirm>
                    </Flex>
                  ))}
                </Flex>
              ) : (
                <Empty description="No checklist items" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
              <Flex gap="small" align="center" style={{ width: '100%' }}>
                <Input
                  placeholder="Add checklist item..."
                  value={newChecklistTitle}
                  onChange={(e) => onNewChecklistTitleChange(e.target.value)}
                  onPressEnter={onAddChecklistItem}
                  style={{ flex: 1 }}
                />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={onAddChecklistItem}
                >
                  Add
                </Button>
              </Flex>
            </Space>
          </Card>
        </Col>
   
        
      </Row>

     
    </Space>
  )
}
