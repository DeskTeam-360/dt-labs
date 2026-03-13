'use client'

import { Flex, Row, Col, Space, Descriptions, Tag, Typography, Avatar, Empty, Popconfirm, Button, Select } from 'antd'
import { UserOutlined, ClockCircleOutlined, PaperClipOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import DateDisplay from '../DateDisplay'
import CommentWysiwyg from './CommentWysiwyg'
import CommentComposer from './CommentComposer'

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
  author_type?: 'customer' | 'agent'
  user?: { id: string; full_name: string | null; email: string; avatar_url?: string | null }
  comment_attachments?: CommentAttachment[] | null
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
  onAddComment: (commentText: string, attachments: { url: string; file_name: string; file_path: string }[]) => Promise<void>
  addCommentLoading?: boolean
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
  totalTimeSeconds,
  activeTimeTracker,
  currentTime,
  formatTime,
}: TabGeneralCustomerProps) {
  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={14}>
        <Flex
          gap="middle"
          align="flex-start"
          style={{ padding: 10, marginBottom: 10, borderBottom: '1px solid #f0f0f0' }}
        >
          <Avatar icon={<UserOutlined />} src={ticketData.creator?.avatar_url} />
          <Flex vertical style={{ flex: 1, minWidth: 0 }}>
            <Flex justify="space-between" align="center" wrap="wrap" gap="small">
              <Space>
                <Text strong>
                  {ticketData.company?.name || ticketData.creator?.full_name || ticketData.creator?.email || 'Unknown'}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <DateDisplay date={ticketData.created_at} />
                </Text>
              </Space>
            </Flex>
            <div
              className="ql-editor comment-html"
              style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
              dangerouslySetInnerHTML={{ __html: ticketData.description || '<p></p>' }}
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

        <Flex orientation="vertical" style={{ width: '100%', padding: 16 }} gap={30}>
          {comments.length > 0 ? (
            <Flex vertical gap={10}>
              {comments.map((comment) => {
                const isCustomer = comment.author_type === 'customer'
                const isCurrentUser = comment.user_id === currentUserId
                const cardBg = isCustomer ? 'rgba(230, 247, 255, 0.5)' : 'rgba(255, 251, 230, 0.4)'
                const borderColor = isCustomer ? '#91caff' : '#ffe58f'
                const borderStyle = isCurrentUser
                  ? { borderRight: '3px solid green' as const }
                  : { borderLeft: `3px solid ${borderColor}` as const }
                return (
                  <Flex
                    key={comment.id}
                    gap="middle"
                    align="flex-start"
                    style={{ padding: 20, backgroundColor: cardBg, borderRadius: 10, ...borderStyle }}
                  >
                    <Avatar icon={<UserOutlined />} src={comment.user?.avatar_url} />
                    <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                      <Flex justify="space-between" align="center" wrap="wrap" gap="small">
                        <Space>
                          <Text strong>
                            {isCustomer
                              ? (ticketData.company?.name || 'Customer') + ' - ' + (comment.user?.full_name || comment.user?.email || 'Unknown')
                              : (comment.user?.full_name || comment.user?.email || 'Unknown')}
                          </Text>
                          {/* <Tag color={isCustomer ? 'cyan' : 'gold'}>
                            {isCustomer ? 'Customer' : 'Agent'}
                          </Tag> */}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <DateDisplay date={comment.created_at} />
                          </Text>
                        </Space>
                        {!isCustomer && comment.user_id === currentUserId && editingComment !== comment.id && (
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
                            dangerouslySetInnerHTML={{ __html: comment.comment }}
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
            <Space>
              <UserOutlined />
              <Text>
                {ticketData.company?.name || ticketData.creator?.full_name || ticketData.creator?.email || 'Unknown'}
              </Text>
            </Space>
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
