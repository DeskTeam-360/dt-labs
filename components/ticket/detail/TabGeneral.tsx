'use client'

import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  ForwardFilled,
  MessageOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Avatar,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo,useState } from 'react'

import DateDisplay from '@/components/common/DateDisplay'
import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'

import CommentAiSummaryTrigger from './CommentAiSummaryTrigger'
import CommentComposer from './CommentComposer'
import CommentTaggedCcLines from './CommentTaggedCcLines'
import CommentWysiwyg from './CommentWysiwyg'
import TicketUserMention from './TicketUserMention'

const { Text, Paragraph } = Typography

function OriginalDescriptionCollapse({ ticketData }: { ticketData: unknown }) {
  const [open, setOpen] = useState(false)
  const orig =
    ticketData && typeof ticketData === 'object' && 'original_description' in ticketData
      ? (ticketData as { original_description?: string | null }).original_description
      : null
  if (!orig) return null
  return (
    <div style={{ marginTop: 12 }}>
      <Button
        type="link"
        size="small"
        style={{ padding: 0, fontSize: 12 }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide original email content' : 'View original email content'}
      </Button>
      {open && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 14px',
            borderLeft: '3px solid var(--ant-color-border)',
            background: 'var(--ant-color-bg-layout)',
            borderRadius: 4,
            opacity: 0.85,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
            Original content (before edit)
          </Text>
          <div
            className="ql-editor comment-html"
            style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 13 }}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(orig) }}
          />
        </div>
      )}
    </div>
  )
}

function ticketSidebarPriorityValue(ticketData: unknown): number | null {
  const raw =
    ticketData && typeof ticketData === 'object' && 'priority' in ticketData
      ? (ticketData as { priority?: unknown }).priority
      : undefined
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
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

/** Sidebar ticket attributes — edited locally until Save attributes */
export interface SidebarAttributesDraft {
  status: string
  projectStatusId: number | null
  typeId: number | null
  /** Queue rank ≥1 within company support pool; null = unranked (e.g. closed). */
  priority: number | null
  companyId: string | null
  tagIds: string[]
  contactUserId: string | null
  dueDate: string | null
  teamId: string | null
  /** Local short note text; persisted with Save changes */
  shortNote: string
}

function snapshotSidebarDraft(params: {
  ticketData: any
  selectedTagIds: string[]
  selectedContactUserId: string | null
  selectedTeamId: string | null
  shortNoteProp: string | null | undefined
}): SidebarAttributesDraft {
  const {
    ticketData,
    selectedTagIds,
    selectedContactUserId,
    selectedTeamId,
    shortNoteProp,
  } = params
  return {
    status: String(ticketData?.status ?? 'open'),
    projectStatusId: ticketData?.project_status_id ?? null,
    typeId: ticketData?.type_id ?? null,
    priority: ticketSidebarPriorityValue(ticketData),
    companyId: ticketData?.company_id ?? null,
    tagIds: [...selectedTagIds],
    contactUserId: selectedContactUserId ?? null,
    dueDate: ticketData?.due_date ? String(ticketData.due_date) : null,
    teamId: selectedTeamId ?? null,
    shortNote: typeof shortNoteProp === 'string' ? shortNoteProp : '',
  }
}

function sidebarDraftEquals(a: SidebarAttributesDraft, b: SidebarAttributesDraft): boolean {
  const norm = (d: SidebarAttributesDraft) =>
    JSON.stringify({
      ...d,
      tagIds: [...d.tagIds].slice().sort(),
    })
  return norm(a) === norm(b)
}

interface TabGeneralProps {
  ticketData: any
  ticketAttachments?: TicketAttachment[]
  statusOptions: StatusOption[]
  /** Board columns for `ticket_type === 'project'` */
  projectStatusOptions?: { id: number; title: string; slug: string; color: string }[]
  typeOptions: { id: number; title: string; slug: string; color: string }[]
  companyOptions: { id: string; name: string }[]
  /** Users who can be set as email reply contact; optional company_id for cross-company hints. */
  contactUserOptions?: Array<{
    id: string
    full_name: string | null
    email: string
    company_id?: string | null
  }>
  selectedContactUserId?: string | null
  tagOptions: { id: string; name: string; slug: string }[]
  selectedTagIds: string[]
  /** When false, company and tags are read-only (customer view) */
  canEditCompanyAndTags?: boolean
  teamOptions: { id: string; name: string }[]
  selectedTeamId: string | null
  canEditAssignees?: boolean
  /** Bump after batch-save succeeds so sidebar draft resets from props */
  sidebarBaselineTick: number
  sidebarAttributesSaving?: boolean
  onSaveSidebarAttributes: (draft: SidebarAttributesDraft) => Promise<void>
  totalTimeSeconds: number
  activeTimeTracker: any
  currentTime: number
  formatTime: (seconds: number) => string
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
  onRemoveCommentAttachment: (commentId: string, attachmentId: string) => void | Promise<void>
  removingCommentAttachmentKey?: string | null
  onAddComment: (
    commentText: string,
    attachments: { url: string; file_name: string; file_path: string }[],
    extra?: {
      taggedUserIds?: string[]
      ccEmails?: string[]
      bccEmails?: string[]
      summaryAsNote?: boolean
    }
  ) => Promise<void>
  onAddChecklistItemsBulk?: (titles: string[]) => Promise<void>
  onAddAiSummaryComment?: (html: string) => Promise<void>
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
  /** Agent: edit ticket description with explicit Save/Cancel */
  canEditTicketDescription?: boolean
  ticketDescriptionDraft?: string
  onTicketDescriptionDraftChange?: (html: string) => void
  ticketDescriptionEditing?: boolean
  onTicketDescriptionEditingStart?: () => void
  onTicketDescriptionEditingCancel?: () => void
  onTicketDescriptionSave?: () => void | Promise<void>
  ticketDescriptionSaving?: boolean
  onApplyAiSummaryToDescription?: (html: string) => Promise<void>
  currentUserRole?: string | null
}

export default function TabGeneral({
  ticketData,
  ticketAttachments = [],
  statusOptions,
  projectStatusOptions,
  typeOptions,
  companyOptions,
  contactUserOptions = [],
  selectedContactUserId = null,
  tagOptions,
  selectedTagIds,
  canEditCompanyAndTags = true,
  teamOptions,
  selectedTeamId,
  canEditAssignees = true,
  sidebarBaselineTick,
  sidebarAttributesSaving = false,
  onSaveSidebarAttributes,
  totalTimeSeconds,
  activeTimeTracker,
  currentTime,
  formatTime,
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
  onRemoveCommentAttachment,
  removingCommentAttachmentKey = null,
  onAddComment,
  onAddChecklistItemsBulk,
  onAddAiSummaryComment,
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
  canEditTicketDescription = false,
  ticketDescriptionDraft = '',
  onTicketDescriptionDraftChange,
  ticketDescriptionEditing = false,
  onTicketDescriptionEditingStart,
  onTicketDescriptionEditingCancel,
  onTicketDescriptionSave,
  ticketDescriptionSaving = false,
  onApplyAiSummaryToDescription,
  currentUserRole,
}: TabGeneralProps) {
  const canAccessTicketSummary = ['admin', 'manager'].includes((currentUserRole ?? '').toLowerCase())
  const [sidebarDraft, setSidebarDraft] = useState<SidebarAttributesDraft>(() =>
    snapshotSidebarDraft({
      ticketData,
      selectedTagIds,
      selectedContactUserId,
      selectedTeamId,
      shortNoteProp: ticketData?.short_note ?? null,
    }),
  )
  const [sidebarBaseline, setSidebarBaseline] = useState<SidebarAttributesDraft>(() =>
    snapshotSidebarDraft({
      ticketData,
      selectedTagIds,
      selectedContactUserId,
      selectedTeamId,
      shortNoteProp: ticketData?.short_note ?? null,
    }),
  )

  useEffect(() => {
    const s = snapshotSidebarDraft({
      ticketData,
      selectedTagIds,
      selectedContactUserId,
      selectedTeamId,
      shortNoteProp: ticketData?.short_note ?? null,
    })
    setSidebarBaseline(s)
    setSidebarDraft(s)
  }, [ticketData?.id, ticketData?.priority, ticketData?.short_note, sidebarBaselineTick])

  const sidebarDirty = useMemo(
    () => !sidebarDraftEquals(sidebarDraft, sidebarBaseline),
    [sidebarDraft, sidebarBaseline],
  )

  const statusSelectOptions = useMemo(() => {
    const cur = sidebarDraft.status as string | undefined
    const active = statusOptions.filter((s) => s.is_active !== false)
    if (cur && !active.some((s) => s.slug === cur)) {
      const row = statusOptions.find((s) => s.slug === cur)
      return row ? [...active, row] : active
    }
    return active
  }, [statusOptions, sidebarDraft.status])

  const useProjectBoardStatus =
    ticketData?.ticket_type === 'project' &&
    Array.isArray(projectStatusOptions) &&
    projectStatusOptions.length > 0

  const contactCrossCompanyHint = useMemo(() => {
    if (!sidebarDraft.contactUserId || !ticketData.company_id) return null
    const row = contactUserOptions.find((o) => o.id === sidebarDraft.contactUserId)
    const uid = row?.company_id
    if (!uid || uid === ticketData.company_id) return null
    const otherName = companyOptions.find((c) => c.id === uid)?.name ?? 'another company'
    return `Contact is from ${otherName}. After saving, the ticket's company will match the contact's company (cross-company).`
  }, [sidebarDraft.contactUserId, ticketData.company_id, contactUserOptions, companyOptions])

  const creatorId = ticketData.creator?.id ?? ticketData.created_by ?? null
  const creatorEmail = ticketData.creator?.email ?? null
  const isAutomationCreated = ticketData.created_via === 'recurring' || ticketData.created_via === 'automation'
  const automationLabel = ticketData.created_via === 'recurring' ? 'Recurring Ticket' : 'Automation'
  /** Thread header: company + person when both exist (portal context). */
  const creatorLabel = isAutomationCreated
    ? [ticketData.company?.name, automationLabel].filter(Boolean).join(' · ') || automationLabel
    : [ticketData.company?.name, ticketData.creator?.full_name || ticketData.creator?.email].filter(Boolean).join(' · ') ||
      ticketData.creator?.full_name ||
      ticketData.creator?.email ||
      ticketData.company?.name ||
      'Unknown'
  /** Sidebar "Created By": person under company ticket only (company has its own row). */
  const createdByPersonLabel = isAutomationCreated
    ? automationLabel
    : ticketData.creator?.full_name || ticketData.creator?.email || '—'

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={[24, 24]} align="top">
      <Col xs={16}>


      <Flex gap="middle" align="flex-start" style={{ padding: 10, marginBottom: 10, borderBottom: '1px solid var(--ticket-thread-divider)' }}>
                      {(ticketData.created_via === 'recurring' || ticketData.created_via === 'automation') ? (
                        <Avatar
                          style={{ backgroundColor: '#722ed1', flexShrink: 0 }}
                          icon={ticketData.created_via === 'recurring' ? <SyncOutlined /> : <RobotOutlined />}
                        />
                      ) : (
                        <TicketUserMention userId={creatorId} email={creatorEmail}>
                          <Avatar style={{ cursor: creatorId ? 'pointer' : undefined }} icon={<UserOutlined />} src={ticketData.creator?.avatar_url} />
                        </TicketUserMention>
                      )}
                      <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                        <Flex justify="space-between" align="flex-start" wrap="wrap" gap="small">
                          <Flex vertical gap={2} style={{ minWidth: 0, flex: 1 }}>
                            {ticketData.company_id && (
                              <Text strong>
                                {ticketData.company?.name ||
                                  companyOptions.find((c) => c.id === ticketData.company_id)?.name ||
                                  '—'}
                              </Text>
                            )}
                            <Text
                              type="secondary"
                              style={{ fontSize: 12, color: 'var(--ticket-thread-meta)' }}
                            >
                              Created By{' '}
                              {isAutomationCreated ? (
                                <Text style={{ color: '#722ed1', fontWeight: 500 }}>{createdByPersonLabel}</Text>
                              ) : (
                                <TicketUserMention userId={creatorId} email={creatorEmail} className="ml-1">
                                  <Text
                                    style={{ cursor: creatorId ? 'pointer' : undefined, color: 'var(--ticket-thread-text)' }}
                                  >
                                    {createdByPersonLabel}
                                  </Text>
                                </TicketUserMention>
                              )}
                              <Text style={{ fontSize: 12, color: 'var(--ticket-thread-meta)', marginLeft: 4 }}>
                                Created At: <DateDisplay date={ticketData.created_at} />
                              </Text>
                            </Text>
                          </Flex>
                          {ticketData?.id && !ticketDescriptionEditing && (onApplyAiSummaryToDescription || (canAccessTicketSummary && onAddAiSummaryComment) || canEditTicketDescription) ? (
                            <Flex gap={6} align="center" style={{ flexShrink: 0 }}>
                              {onApplyAiSummaryToDescription ? (
                                <CommentAiSummaryTrigger
                                  ticketId={ticketData.id}
                                  summarizeAnchor={{ type: 'description' }}
                              
                                  disabled={ticketDescriptionSaving}
                                  onApplyToDescription={onApplyAiSummaryToDescription}
                                  tooltip="Summarize description (AI)"
                                />
                              ) : null}
                              {canAccessTicketSummary && showNoteOption && onAddAiSummaryComment ? (
                                <CommentAiSummaryTrigger
                                  ticketId={ticketData.id}
                                  summarizeAnchor={{ type: 'ticket' }}
                                  addCommentLoading={addCommentLoading}
                                  disabled={addCommentLoading || ticketDescriptionSaving}
                                  onAddComment={onAddAiSummaryComment}
                                  onAddChecklistItems={onAddChecklistItemsBulk}
                                  tooltip="Summarize full ticket — last 100 messages (Admin/Manager)"
                                  variant="ticket"
                                />
                              ) : null}
                              {canEditTicketDescription ? (
                                <Button
                                  type="primary"
                                  icon={<EditOutlined />}
                                  onClick={onTicketDescriptionEditingStart}
                                  aria-label="Edit description"
                                />
                              ) : null}
                            </Flex>
                          ) : null}
                        </Flex>
                        {ticketDescriptionEditing && canEditTicketDescription ? (
                          <Space orientation="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
                            <CommentWysiwyg
                              value={ticketDescriptionDraft}
                              onChange={onTicketDescriptionDraftChange}
                              ticketId={ticketData?.id}
                              placeholder="Ticket description..."
                              height="220px"
                            />
                            <Flex gap={8} wrap="wrap">
                              <Button
                                type="primary"
                                loading={ticketDescriptionSaving}
                                onClick={() => void onTicketDescriptionSave?.()}
                              >
                                Save description
                              </Button>
                              <Button onClick={onTicketDescriptionEditingCancel}>Cancel</Button>
                            </Flex>
                          </Space>
                        ) : (
                          <>
                            <div
                              className="ql-editor comment-html"
                              style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
                              dangerouslySetInnerHTML={{
                                __html: sanitizeRichHtml(ticketData.description || ''),
                              }}
                            />
                            <OriginalDescriptionCollapse ticketData={ticketData} />
                          </>
                        )}
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
                          {!isAutomation && editingComment !== comment.id && (
                            <Space>
                              {showNoteOption && onAddAiSummaryComment && ticketData?.id ? (
                                <CommentAiSummaryTrigger
                                  ticketId={ticketData.id}
                                  summarizeAnchor={{ type: 'comment', commentId: comment.id }}
                                  size="middle"
                                  addCommentLoading={addCommentLoading}
                                  disabled={addCommentLoading}
                                  onAddComment={onAddAiSummaryComment}
                                  onAddChecklistItems={onAddChecklistItemsBulk}
                                />
                              ) : null}
                              {!isCustomer && comment.user_id === currentUserId ? (
                                <>
                                  <Button
                                    icon={<EditOutlined />}
                                    size="middle"
                                    onClick={() => {
                                      onEditComment(comment.id, comment.comment)
                                    }}
                                  />
                                  {canDeleteComment(comment.created_at) ? (
                                    <Popconfirm
                                      title="Delete comment"
                                      description="Are you sure?"
                                      onConfirm={() => onDeleteComment(comment.id)}
                                      okText="Yes"
                                      cancelText="No"
                                    >
                                      <Button danger icon={<DeleteOutlined />} size="middle" />
                                    </Popconfirm>
                                  ) : null}
                                </>
                              ) : null}
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
                            {comment.comment_attachments.map((att) => {
                              const attKey = att.id ? `${comment.id}:${att.id}` : ''
                              return (
                                <Flex key={att.id || att.file_url} align="center" gap={4} wrap="nowrap">
                                  <a
                                    href={att.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'blue', textDecoration: 'underline' }}
                                  >
                                    <PaperClipOutlined /> {att.file_name}
                                  </a>
                                  {editingComment === comment.id && att.id ? (
                                    <Popconfirm
                                      title="Remove this attachment?"
                                      okText="Remove"
                                      cancelText="Cancel"
                                      onConfirm={() => void onRemoveCommentAttachment(comment.id, att.id)}
                                    >
                                      <Button
                                        type="text"
                                        danger
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        aria-label="Remove attachment"
                                        loading={removingCommentAttachmentKey === attKey}
                                      />
                                    </Popconfirm>
                                  ) : null}
                                </Flex>
                              )
                            })}
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

        <Col xs={8} className="ticket-detail-sidebar-sticky">
          <div >
          <Flex justify="flex-end" gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              disabled={!sidebarDirty || sidebarAttributesSaving}
              loading={sidebarAttributesSaving}
              onClick={() => void onSaveSidebarAttributes(sidebarDraft)}
            >
              {sidebarAttributesSaving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              disabled={!sidebarDirty || sidebarAttributesSaving}
              onClick={() => setSidebarDraft(sidebarBaseline)}
            >
              Reset
            </Button>
          </Flex>
          <Descriptions column={1} bordered style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            <Descriptions.Item label="Short Note">
              <Input.TextArea
                value={sidebarDraft.shortNote}
                onChange={(e) =>
                  setSidebarDraft((d) => ({
                    ...d,
                    shortNote: e.target.value,
                  }))
                }
                placeholder="Short note (optional)"
                rows={2}
                disabled={sidebarAttributesSaving}
                style={{ resize: 'vertical' }}
              />
            </Descriptions.Item>
            <Descriptions.Item label={useProjectBoardStatus ? 'Status proyek' : 'Status'}>
              {useProjectBoardStatus ? (
                <Select
                  value={sidebarDraft.projectStatusId ?? undefined}
                  onChange={(v) =>
                    setSidebarDraft((d) => ({
                      ...d,
                      projectStatusId: v ?? null,
                    }))
                  }
                  loading={sidebarAttributesSaving}
                  options={(projectStatusOptions ?? []).map((s) => ({
                    value: s.id,
                    label: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={s.color} style={{ margin: 0 }}>
                          {s.title}
                        </Tag>
                      </span>
                    ),
                  }))}
                  style={{ minWidth: 140, width: '100%' }}
                  allowClear
                  placeholder="Kolom board"
                />
              ) : (
                <Select
                  value={sidebarDraft.status ?? undefined}
                  onChange={(value) =>
                    value &&
                    setSidebarDraft((d) => ({
                      ...d,
                      status: String(value),
                    }))
                  }
                  loading={sidebarAttributesSaving}
                  options={statusSelectOptions.map((s) => ({
                    value: s.slug,
                    label: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={s.color} style={{ margin: 0 }}>
                          {s.title}
                        </Tag>
                      </span>
                    ),
                  }))}
                  style={{ minWidth: 140, width: '100%' }}
                  allowClear={false}
                />
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              <Select
                value={sidebarDraft.typeId ?? undefined}
                onChange={(v) =>
                  setSidebarDraft((d) => ({
                    ...d,
                    typeId: v ?? null,
                  }))
                }
                loading={sidebarAttributesSaving}
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
              <Tooltip
                title="Integer rank within the company support queue (1 = highest). Leave empty for unranked."
              >
                <InputNumber
                  min={1}
                  precision={0}
                  value={sidebarDraft.priority ?? undefined}
                  onChange={(v) =>
                    setSidebarDraft((d) => ({
                      ...d,
                      priority:
                        v == null || !Number.isFinite(Number(v))
                          ? null
                          : Math.max(1, Math.floor(Number(v))),
                    }))
                  }
                  disabled={sidebarAttributesSaving}
                  placeholder="Rank"
                  style={{ width: '100%', minWidth: 120 }}
                />
              </Tooltip>
            </Descriptions.Item>
            <Descriptions.Item label="Company">
              {canEditCompanyAndTags ? (
                <Select
                  value={sidebarDraft.companyId ?? undefined}
                  onChange={(v) =>
                    setSidebarDraft((d) => ({
                      ...d,
                      companyId: v ?? null,
                    }))
                  }
                  loading={sidebarAttributesSaving}
                  options={companyOptions.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  showSearch
                  optionFilterProp="label"
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
                  value={sidebarDraft.tagIds}
                  onChange={(v) =>
                    setSidebarDraft((d) => ({
                      ...d,
                      tagIds: v ?? [],
                    }))
                  }
                  loading={sidebarAttributesSaving}
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
            {canEditCompanyAndTags ? (
              <Descriptions.Item label="Contact (email replies)">
                <Select
                  value={sidebarDraft.contactUserId ?? undefined}
                  allowClear
                  placeholder="Same as Created By"
                  loading={sidebarAttributesSaving}
                  onChange={(v) =>
                    setSidebarDraft((d) => ({
                      ...d,
                      contactUserId: (v as string | undefined) ?? null,
                    }))
                  }
                  options={contactUserOptions.map((u) => ({
                    value: u.id,
                    label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
                  }))}
                  style={{ minWidth: 200, width: '100%' }}
                  showSearch
                  optionFilterProp="label"
                />
                <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  Agent replies are sent to this person when set; otherwise to Created By.
                </Text>
                {contactCrossCompanyHint ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={contactCrossCompanyHint}
                    style={{ marginTop: 8 }}
                  />
                ) : null}
              </Descriptions.Item>
            ) : ticketData.contact?.id && ticketData.contact.id !== creatorId ? (
              <Descriptions.Item label="Contact">
                <TicketUserMention userId={ticketData.contact.id} email={ticketData.contact.email}>
                  <Space style={{ cursor: 'pointer' }}>
                    <UserOutlined />
                    <Text>{ticketData.contact.full_name || ticketData.contact.email}</Text>
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
              <DatePicker
                value={sidebarDraft.dueDate ? dayjs(sidebarDraft.dueDate) : null}
                onChange={(dt) =>
                  setSidebarDraft((d) => ({
                    ...d,
                    dueDate: dt ? dt.toISOString() : null,
                  }))
                }
                allowClear
                showTime
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }}
                disabled={sidebarAttributesSaving}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Team">
              {canEditAssignees ? (
                <Select
                  value={sidebarDraft.teamId ?? undefined}
                  onChange={(teamId) =>
                    setSidebarDraft((d) => ({
                      ...d,
                      teamId: teamId ?? null,
                    }))
                  }
                  loading={sidebarAttributesSaving}
                  options={teamOptions.map((t) => ({ value: t.id, label: t.name }))}
                  style={{ minWidth: 140, width: '100%' }}
                  placeholder="Select team"
                  allowClear
                />
              ) : (
                <Text>{ticketData.team?.name ?? '—'}</Text>
              )}
            </Descriptions.Item>
            {/* <Descriptions.Item label="Created At">
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
            </Descriptions.Item> */}
            <Descriptions.Item label="Total Time Tracked">
              <Space>
                <ClockCircleOutlined />
                <Text strong>{formatTime(totalTimeSeconds + (activeTimeTracker ? currentTime : 0))}</Text>
              </Space>
            </Descriptions.Item>
            {attributes.length > 0 ? (
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
          </div>
        </Col>
   
        
      </Row>

     
    </Space>
  )
}
