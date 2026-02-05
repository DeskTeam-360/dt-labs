'use client'

import {
  Space,
  Row,
  Col,
  Descriptions,
  Tag,
  Typography,
  Button,
  List,
  Checkbox,
  Avatar,
  Input,
  Card,
  Empty,
  Popconfirm,
  Flex,
} from 'antd'
import {
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CommentOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import DateDisplay from '../DateDisplay'

const { Text, Paragraph } = Typography

interface ChecklistItem {
  id: string
  todo_id: number
  title: string
  is_completed: boolean
  order_index: number
  created_at: string
}

interface Comment {
  id: string
  todo_id: number
  user_id: string
  comment: string
  created_at: string
  user?: { id: string; full_name: string | null; email: string }
}

interface Attribute {
  id: string
  todo_id: number
  meta_key: string
  meta_value: string | null
  created_at: string
  updated_at: string
}

const { TextArea } = Input

interface TabGeneralProps {
  todoData: any
  getStatusColor: (status: string) => string
  getStatusLabel: (status: string) => string
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
  onAddComment: () => void
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
  onAddComment,
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
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={[24, 24]}>
      <Col xs={16}>
          <Card
            title={
              <Space>
                <CommentOutlined />
                <Text strong>Comments ({comments.length})</Text>
              </Space>
            }
            size="small"
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {comments.length > 0 ? (
                <List
                  dataSource={comments}
                  renderItem={(comment) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} />}
                        title={
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
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
                                <Button
                                  icon={<EditOutlined />}
                                  size="middle"
                                  onClick={() => {
                                    onEditComment(comment.id, comment.comment)
                                  }}
                                />
                                {canDeleteComment(comment.created_at) && (
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
                                )}
                              </Space>
                            )}
                          </div>
                        }
                        description={
                          <Space orientation="vertical" style={{ width: '100%' }} size="small">
                            {editingComment === comment.id ? (
                              <Space orientation="vertical" style={{ width: '100%' }} size="small">
                                <TextArea
                                  value={editingCommentValue}
                                  onChange={(e) => onEditingCommentValueChange(e.target.value)}
                                  rows={3}
                                  style={{ resize: 'none' }}
                                />
                                <Space>
                                  <Button
                                    type="primary"
                                    size="small"
                                    onClick={() => onSaveEditComment(comment.id)}
                                    // loading={loading}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={onCancelEditComment}
                                  >
                                    Cancel
                                  </Button>
                                </Space>
                              </Space>
                            ) : (
                              <Paragraph style={{ margin: 0 }}>{comment.comment}</Paragraph>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="No comments" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
              <Space.Compact style={{ width: '100%' }}>
                <TextArea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => onNewCommentChange(e.target.value)}
                  rows={3}
                  style={{ resize: 'none' }}
                />
              </Space.Compact>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onAddComment}
              >
                Add Comment
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={8}>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Status">
              <Tag color={getStatusColor(todoData.status)} style={{ fontSize: 14, padding: '4px 12px' }}>
                {getStatusLabel(todoData.status)}
              </Tag>
            </Descriptions.Item>
            {todoData.type && (
              <Descriptions.Item label="Type">
                <Tag color={todoData.type.color} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {todoData.type.title}
                </Tag>
              </Descriptions.Item>
            )}
            {todoData.company && (
              <Descriptions.Item label="Company">
                <Tag
                  color={(todoData.company as any).color ? undefined : 'cyan'}
                  style={
                    (todoData.company as any).color
                      ? { backgroundColor: (todoData.company as any).color, borderColor: (todoData.company as any).color, color: '#fff' }
                      : undefined
                  }
                >
                  {todoData.company.name}
                </Tag>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Description">
              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {todoData.description || (
                  <Text type="secondary" italic>No description. Click Edit to add a note.</Text>
                )}
              </Paragraph>
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
              {todoData.due_date ? (
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
                            {editingAttribute === attr.id ? (
                              <Button
                                type="text"
                                size="small"
                                onClick={() => onEditingAttributeChange(null)}
                              >
                                Cancel
                              </Button>
                            ) : (
                              <>
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
                              </>
                            )}
                          </Flex>
                        </Flex>
                      }
                    >
                      {editingAttribute === attr.id ? (
                        <Space.Compact style={{ width: '100%' }}>
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
                        </Space.Compact>
                      ) : (
                        <Text>{attr.meta_value || <Text type="secondary">(empty)</Text>}</Text>
                      )}
                    </Descriptions.Item>
                  ))}
                </>
              ) : (
                <></>
              )}
          {/* Input fields for adding a new attribute */}
          
          <Descriptions.Item label="Add new attribute">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Key"
                value={newAttributeKey}
                onChange={e => onNewAttributeKeyChange(e.target.value)}
                style={{ maxWidth: 160 }}
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
            </Space.Compact>
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
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {checklistItems.length > 0 ? (
                <List
                  dataSource={checklistItems}
                  renderItem={(item) => (
                    <List.Item
                      style={{
                        padding: '8px 0',
                        textDecoration: item.is_completed ? 'line-through' : 'none',
                        opacity: item.is_completed ? 0.6 : 1,
                      }}
                    >
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
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
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="No checklist items" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="Add checklist item..."
                  value={newChecklistTitle}
                  onChange={(e) => onNewChecklistTitleChange(e.target.value)}
                  onPressEnter={onAddChecklistItem}
                />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={onAddChecklistItem}
                  // loading={loading}
                >
                  Add
                </Button>
              </Space.Compact>
            </Space>
          </Card>
        </Col>
   
        
      </Row>

     
    </Space>
  )
}
