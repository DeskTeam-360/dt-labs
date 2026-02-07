'use client'

import {
  Space,
  Row,
  Col,
  Descriptions,
  Tag,
  Typography,
  Button,
  Checkbox,
  Avatar,
  Input,
  Card,
  Empty,
  Popconfirm,
  Flex,
  Select,
  DatePicker,
} from 'antd'
import {
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CommentOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PaperClipOutlined,
} from '@ant-design/icons'
import DateDisplay from '../DateDisplay'
import dayjs from 'dayjs'
import CommentWysiwyg from './CommentWysiwyg'

const { Text, Paragraph } = Typography

interface ChecklistItem {
  id: string
  todo_id: number
  title: string
  is_completed: boolean
  order_index: number
  created_at: string
}

interface CommentAttachment { id: string; file_url: string; file_name: string }
interface Comment {
  id: string
  todo_id: number
  user_id: string
  comment: string
  created_at: string
  user?: { id: string; full_name: string | null; email: string; avatar_url?: string | null }
  comment_attachments?: CommentAttachment[] | null
}

interface Attribute {
  id: string
  todo_id: number
  meta_key: string
  meta_value: string | null
  created_at: string
  updated_at: string
}

interface StatusOption {
  slug: string
  title: string
  color: string
}

interface TabGeneralProps {
  todoData: any
  getStatusColor: (status: string) => string
  getStatusLabel: (status: string) => string
  statusOptions: StatusOption[]
  onStatusChange: (newStatus: string) => void | Promise<void>
  statusChanging?: boolean
  typeOptions: { id: number; title: string; slug: string; color: string }[]
  onTypeChange: (typeId: number | null) => void | Promise<void>
  typeChanging?: boolean
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
  newComment: string
  onNewCommentChange: (v: string) => void
  newCommentAttachments: { url: string; file_name: string; file_path: string }[]
  onRemoveNewCommentAttachment: (index: number) => void
  onCommentFilesSelected: (files: FileList | null) => void
  onAddComment: () => void
  addCommentLoading?: boolean
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
  todoData,
  getStatusColor,
  getStatusLabel,
  statusOptions,
  onStatusChange,
  statusChanging = false,
  typeOptions,
  onTypeChange,
  typeChanging = false,
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
  newComment,
  onNewCommentChange,
  newCommentAttachments,
  onRemoveNewCommentAttachment,
  onCommentFilesSelected,
  onAddComment,
  addCommentLoading = false,
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
  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={[24, 24]}>
      <Col xs={14}>


      <Flex gap="middle" align="flex-start" style={{ padding: 10, marginBottom: 10, borderBottom: '1px solid black',  }}>
                      <Avatar icon={<UserOutlined />} src={todoData.creator?.avatar_url} />
                      <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                        <Flex justify="space-between" align="center" wrap="wrap" gap="small">
                          <Space>
                            <Text strong>
                              {todoData.creator?.full_name || todoData.creator?.email || 'Unknown'}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              <DateDisplay date={todoData.created_at} />
                            </Text>
                          </Space>
                         
                        </Flex>
                       
                            <div
                              className="ql-editor comment-html"
                              style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
                              dangerouslySetInnerHTML={{ __html: todoData.description }}
                            />
                      
                      </Flex>
                    </Flex>
          
            <Flex orientation="vertical" style={{ width: '100%', padding: 16 }} gap={30}>
              {comments.length > 0 ? (
                <Flex vertical gap="middle">
                  {comments.map((comment) => (
                    <Flex key={comment.id} gap="middle" align="flex-start" style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #e8e8e8',  }}>
                      <Avatar icon={<UserOutlined />} src={comment.user?.avatar_url} />
                      <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                        <Flex justify="space-between" align="center" wrap="wrap" gap="small">
                          <Space>
                            <Text strong>
                              {comment.user?.full_name || comment.user?.email || 'Unknown'}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              <DateDisplay date={comment.created_at} />
                            </Text>
                          </Space>
                          {comment.user_id === currentUserId && editingComment !== comment.id && (
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
                        <Space orientation="vertical" size="small" style={{ width: '100%', marginTop: 4 }}>
                          {editingComment === comment.id ? (
                            <Flex vertical gap={40} style={{ width: '100%' }}>
                              <CommentWysiwyg
                                ticketId={todoData?.id}
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
                              style={{ margin: 0, padding: 0, minHeight: 'auto', fontSize: 14 }}
                              dangerouslySetInnerHTML={{ __html: comment.comment }}
                            />
                          ) : (
                            <Paragraph style={{ margin: 0 }}>{comment.comment}</Paragraph>
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
                  ))}
                </Flex>
              ) : (
                <Empty description="No comments" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
              <CommentWysiwyg
                ticketId={todoData?.id}
                value={newComment}
                onChange={onNewCommentChange}
                placeholder="Add a comment..."
                height="200px"
              />
              {newCommentAttachments.length > 0 && (
                <Flex gap={8} wrap="wrap" align="center" style={{ marginTop: 8 }}>
                  {newCommentAttachments.map((a, i) => (
                    <Flex key={i} align="center" gap={4} style={{ padding: '4px 8px', background: '#f5f5f5', borderRadius: 6 }}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <PaperClipOutlined /> {a.file_name}
                      </a>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onRemoveNewCommentAttachment(i)} />
                    </Flex>
                  ))}
                </Flex>
              )}
              <Flex gap={8} style={{ marginTop: 8 }}>
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  id="comment-files-input"
                  onChange={(e) => {
                    onCommentFilesSelected(e.target.files)
                    e.target.value = ''
                  }}
                />
                <Button icon={<PaperClipOutlined />} onClick={() => document.getElementById('comment-files-input')?.click()}>
                  Attach files
                </Button>
                <Button
                  type="primary"
                  style={{ width: '200px' }}
                  icon={<PlusOutlined />}
                  onClick={onAddComment}
                  loading={addCommentLoading}
                  disabled={addCommentLoading}
                >
                  Add Comment
                </Button>
              </Flex>
            </Flex>
          {/* </Card> */}
        </Col>

        <Col xs={10}>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Status">
              <Select

                value={todoData.status ?? undefined}
                onChange={(value) => value && onStatusChange(value)}
                loading={statusChanging}
                options={statusOptions.map((s) => ({
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
                value={todoData.type_id ?? undefined}
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
            <Descriptions.Item label="Company">
              {canEditCompanyAndTags ? (
                <Select
                  value={todoData.company_id ?? undefined}
                  onChange={(v) => onCompanyChange(v ?? null)}
                  loading={companyChanging}
                  options={companyOptions.map((c) => ({ value: c.id, label: c.name }))}
                  style={{ minWidth: 140, width: '100%' }}
                  allowClear
                  placeholder="Select company"
                />
              ) : (
                <Text>{companyOptions.find((c) => c.id === todoData.company_id)?.name ?? (todoData.company?.name || '—')}</Text>
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
            <Descriptions.Item label="Created By">
              <Space>
                <UserOutlined />
                <Text>
                  {todoData.creator?.full_name || todoData.creator?.email || 'Unknown'}
                </Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Due Date">
              {onDueDateChange ? (
                <DatePicker
                  value={todoData.due_date ? dayjs(todoData.due_date) : null}
                  onChange={(d) => onDueDateChange(d ? d.toISOString() : null)}
                  allowClear
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: '100%' }}
                  disabled={dueDateChanging}
                />
              ) : todoData.due_date ? (
                <Space>
                  <ClockCircleOutlined />
                  <DateDisplay date={todoData.due_date} />
                </Space>
              ) : (
                <Text type="secondary">No due date</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Created At">
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={todoData.created_at} />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Updated At">
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={todoData.updated_at} />
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
