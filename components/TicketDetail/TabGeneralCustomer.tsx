'use client'

import { Flex, Row, Col, Space, Descriptions, Tag, Typography, Avatar, Empty, Popconfirm, Button, Select } from 'antd'
import { UserOutlined, ThunderboltOutlined, ClockCircleOutlined, PaperClipOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import DateDisplay from '../DateDisplay'
import CommentWysiwyg from './CommentWysiwyg'
import CommentComposer from './CommentComposer'
import CommentTaggedCcLines from './CommentTaggedCcLines'
import TicketUserMention from './TicketUserMention'
import { sanitizeRichHtml } from '@/lib/sanitize-rich-html'

const { Text, Paragraph } = Typography

interface CommentAttachment {
  id: string
  file_url: string
  file_name: string
}

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

interface StatusOption {
  slug: string
  title: string
  color: string
}

interface TicketAttachment {
  id: string
  file_url: string
  file_name: string
  file_path?: string
}

interface TabGeneralCustomerProps {
  ticketData: any
  ticketAttachments?: TicketAttachment[]
  statusOptions: StatusOption[]
  typeOptions: { id: number; title: string; slug: string; color: string }[]
  onTypeChange?: (typeId: number | null) => void | Promise<void>
  typeChanging?: boolean
  priorityOptions: { id: number; title: string; slug: string; color: string }[]
  onPriorityChange?: (priorityId: number | null) => void | Promise<void>
  priorityChanging?: boolean
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
  companyCustomers?: Array<{ id: string; full_name: string | null; email: string }>
  /** Emails ever CC'd on this ticket - pre-fill CC on replies */
  ticketCcEmails?: string[]
  totalTimeSeconds: number
  activeTimeTracker: any
  currentTime: number
  formatTime: (seconds: number) => string
}

export default function TabGeneralCustomer({
  ticketData,
  ticketAttachments = [],
  statusOptions,
  typeOptions,
  onTypeChange,
  typeChanging = false,
  priorityOptions,
  onPriorityChange,
  priorityChanging = false,
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
  companyCustomers = [],
  ticketCcEmails = [],
  totalTimeSeconds,
  activeTimeTracker,
  currentTime,
  formatTime,
}: TabGeneralCustomerProps) {
  const creatorId = ticketData.creator?.id ?? ticketData.created_by ?? null
  const creatorEmail = ticketData.creator?.email ?? null
  const creatorLabel =
    ticketData.company?.name || ticketData.creator?.full_name || ticketData.creator?.email || 'Unknown'

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={14}>
        <Flex
          gap="middle"
          align="flex-start"
          style={{ padding: 10, marginBottom: 10, borderBottom: '1px solid #f0f0f0' }}
        >
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
                <Text type="secondary" style={{ fontSize: 12 }}>
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
                  <a
                    key={att.id}
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <PaperClipOutlined /> {att.file_name}
                  </a>
                ))}
              </Flex>
            )}
          </Flex>
        </Flex>

        <div style={{ padding: '0 16px', marginTop: 8, marginBottom: 4 }}>
          {commentsHasOlder ? (
            <Button
              type="link"
              loading={loadMoreCommentsLoading}
              onClick={() => onLoadMoreComments?.()}
              style={{ padding: 0 }}
            >
              Load older comments
              {commentsOlderRemaining > 0 ? ` (${commentsOlderRemaining} belum ditampilkan)` : ''}
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
                const cardBg = isAutomation
                  ? 'rgba(246, 240, 255, 0.6)'
                  : isCustomer
                    ? 'rgba(230, 247, 255, 0.5)'
                    : 'rgba(255, 251, 230, 0.4)'
                const borderColor = isAutomation ? '#b37feb91' : isCustomer ? '#91caff' : '#ffe58f'
                const borderStyle = isCurrentUser
                  ? { borderRight: '3px solid green' as const }
                  : { borderLeft: `3px solid ${borderColor}` as const }
                const authorLabel = isAutomation
                  ? 'Automation'
                  : isCustomer
                    ? (ticketData.company?.name || 'Customer') + ' - ' + (comment.user?.full_name || comment.user?.email || 'Unknown')
                    : comment.user?.full_name || comment.user?.email || 'Unknown'
                return (
                  <Flex
                    key={comment.id}
                    gap="middle"
                    align="flex-start"
                    style={{ padding: 20, backgroundColor: cardBg, borderRadius: 10, ...borderStyle }}
                  >
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
                            <Text strong>{authorLabel}</Text>
                          ) : (
                            <TicketUserMention userId={comment.user_id} email={comment.user?.email}>
                              <Text strong style={{ cursor: comment.user_id ? 'pointer' : undefined }}>
                                {authorLabel}
                              </Text>
                            </TicketUserMention>
                          )}
                          {/* <Tag color={isCustomer ? 'cyan' : 'gold'}>
                            {isCustomer ? 'Customer' : 'Agent'}
                          </Tag> */}
                          <Text type="secondary" style={{ fontSize: 12 }}>
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
                                  onClick={() => onEditComment(comment.id, comment.comment)}
                                />
                                <Popconfirm
                                  title="Delete comment"
                                  description="Are you sure?"
                                  onConfirm={() => onDeleteComment(comment.id)}
                                  okText="Yes"
                                  cancelText="No"
                                >
                                  <Button danger icon={<DeleteOutlined />} size="middle" />
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
                          const u = companyCustomers?.find((x) => x.id === id)
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
                              <Button type="primary" onClick={() => onSaveEditComment(comment.id)}>
                                Save
                              </Button>
                              <Button onClick={onCancelEditComment}>Cancel</Button>
                            </Space>
                          </Flex>
                        ) : comment.comment && /<[a-z][\s\S]*>/i.test(comment.comment) ? (
                          <div
                            className="ql-editor comment-html"
                            style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
                            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(comment.comment) }}
                          />
                        ) : (
                          <Paragraph style={{ margin: 0 }}>{comment.comment}</Paragraph>
                        )}

                        {comment.comment_attachments?.length ? (
                          <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                            {comment.comment_attachments.map((att) => (
                              <a
                                key={att.id || att.file_url}
                                href={att.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <PaperClipOutlined /> {att.file_name}
                              </a>
                            ))}
                          </Flex>
                        ) : null}
                      </Space>
                    </Flex>
                  </Flex>
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
            commentVisibility="reply"
            showNoteOption={false}
            companyCustomers={companyCustomers}
            ticketCcEmails={ticketCcEmails}
          />
        </Flex>
      </Col>

      <Col xs={24} lg={10}>
        <Descriptions column={1} bordered>
          <Descriptions.Item label="Status">
            <Tag color={statusOptions.find((s) => s.slug === ticketData.status)?.color ?? 'default'}>
              {statusOptions.find((s) => s.slug === ticketData.status)?.title ?? ticketData.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Type">
            {onTypeChange ? (
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
            ) : (
              <Text>
                {ticketData.type_id
                  ? typeOptions.find((t) => t.id === ticketData.type_id)?.title ?? '—'
                  : '—'}
              </Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Priority">
            {onPriorityChange ? (
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
            ) : (
              <Text>
                {ticketData.priority_id
                  ? priorityOptions.find((p) => p.id === ticketData.priority_id)?.title ?? '—'
                  : '—'}
              </Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Created By">
            <TicketUserMention userId={creatorId} email={creatorEmail}>
              <Space style={{ cursor: creatorId ? 'pointer' : undefined }}>
                <UserOutlined />
                <Text>{creatorLabel}</Text>
              </Space>
            </TicketUserMention>
          </Descriptions.Item>
          <Descriptions.Item label="CC Recipients">
            {ticketCcEmails?.length ? (
              <Text style={{ fontSize: 12 }}>{ticketCcEmails.join(', ')}</Text>
            ) : (
              <Text type="secondary">—</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Due Date">
            {ticketData.due_date ? (
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={ticketData.due_date} />
              </Space>
            ) : (
              <Text type="secondary">No due date</Text>
            )}
          </Descriptions.Item>
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
          </Descriptions.Item>
        </Descriptions>
      </Col>
    </Row>
  )
}
