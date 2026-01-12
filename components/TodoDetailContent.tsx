'use client'

import {
  Layout,
  Card,
  Descriptions,
  Tag,
  Typography,
  Button,
  Space,
  Row,
  Col,
  Divider,
  Input,
  List,
  Checkbox,
  Avatar,
  Form,
  message,
  Popconfirm,
  Empty,
  Table,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CommentOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import dayjs from 'dayjs'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

interface TodoDetailContentProps {
  user: User
  todoData: any
  checklistItems: any[]
  comments: any[]
  attributes: any[]
}

interface ChecklistItem {
  id: string
  todo_id: string
  title: string
  is_completed: boolean
  order_index: number
  created_at: string
}

interface Comment {
  id: string
  todo_id: string
  user_id: string
  comment: string
  created_at: string
  user?: {
    id: string
    full_name: string | null
    email: string
  }
}

interface Attribute {
  id: string
  todo_id: string
  meta_key: string
  meta_value: string | null
  created_at: string
  updated_at: string
}

export default function TodoDetailContent({
  user: currentUser,
  todoData,
  checklistItems: initialChecklistItems,
  comments: initialComments,
  attributes: initialAttributes,
}: TodoDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(initialChecklistItems)
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [attributes, setAttributes] = useState<Attribute[]>(initialAttributes)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false)
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newComment, setNewComment] = useState('')
  const [editingAttribute, setEditingAttribute] = useState<string | null>(null)
  const [newAttributeKey, setNewAttributeKey] = useState('')
  const [newAttributeValue, setNewAttributeValue] = useState('')
  const [form] = Form.useForm()

  const supabase = createClient()

  // Fetch team members if todo has a team
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (todoData.visibility === 'team' && todoData.team_id) {
        setLoadingTeamMembers(true)
        try {
          const { data, error } = await supabase
            .from('team_members')
            .select(`
              *,
              user:users!team_members_user_id_fkey(id, full_name, email)
            `)
            .eq('team_id', todoData.team_id)

          if (error) throw error
          setTeamMembers(data || [])
        } catch (error: any) {
          console.error('Failed to fetch team members:', error)
        } finally {
          setLoadingTeamMembers(false)
        }
      } else {
        setTeamMembers([])
      }
    }

    fetchTeamMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoData.team_id, todoData.visibility])

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      to_do: 'default',
      in_progress: 'processing',
      completed: 'success',
      cancel: 'error',
      archived: 'default',
    }
    return colorMap[status] || 'default'
  }

  const getStatusLabel = (status: string) => {
    const labelMap: Record<string, string> = {
      to_do: 'To Do',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancel: 'Cancel',
      archived: 'Archived',
    }
    return labelMap[status] || status
  }

  const getVisibilityColor = (visibility: string) => {
    const colorMap: Record<string, string> = {
      private: 'default',
      team: 'blue',
      specific_users: 'green',
    }
    return colorMap[visibility] || 'default'
  }

  // Checklist functions
  const handleAddChecklistItem = async () => {
    if (!newChecklistTitle.trim()) {
      message.warning('Please enter a checklist item title')
      return
    }

    setLoading(true)
    try {
      const maxOrder = checklistItems.length > 0 
        ? Math.max(...checklistItems.map(item => item.order_index))
        : -1

      const { data, error } = await supabase
        .from('todo_checklist')
        .insert({
          todo_id: todoData.id,
          title: newChecklistTitle.trim(),
          is_completed: false,
          order_index: maxOrder + 1,
        })
        .select()
        .single()

      if (error) throw error

      setChecklistItems([...checklistItems, data])
      setNewChecklistTitle('')
      message.success('Checklist item added')
    } catch (error: any) {
      message.error(error.message || 'Failed to add checklist item')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleChecklistItem = async (itemId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('todo_checklist')
        .update({ is_completed: !currentStatus })
        .eq('id', itemId)

      if (error) throw error

      setChecklistItems(
        checklistItems.map((item) =>
          item.id === itemId ? { ...item, is_completed: !currentStatus } : item
        )
      )
    } catch (error: any) {
      message.error(error.message || 'Failed to update checklist item')
    }
  }

  const handleDeleteChecklistItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('todo_checklist')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      setChecklistItems(checklistItems.filter((item) => item.id !== itemId))
      message.success('Checklist item deleted')
    } catch (error: any) {
      message.error(error.message || 'Failed to delete checklist item')
    }
  }

  // Comment functions
  const handleAddComment = async () => {
    if (!newComment.trim()) {
      message.warning('Please enter a comment')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('todo_comments')
        .insert({
          todo_id: todoData.id,
          user_id: currentUser.id,
          comment: newComment.trim(),
        })
        .select(`
          *,
          user:users!todo_comments_user_id_fkey(id, full_name, email)
        `)
        .single()

      if (error) throw error

      setComments([...comments, data])
      setNewComment('')
      message.success('Comment added')
    } catch (error: any) {
      message.error(error.message || 'Failed to add comment')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('todo_comments')
        .delete()
        .eq('id', commentId)

      if (error) throw error

      setComments(comments.filter((comment) => comment.id !== commentId))
      message.success('Comment deleted')
    } catch (error: any) {
      message.error(error.message || 'Failed to delete comment')
    }
  }

  // Attribute functions
  const handleAddAttribute = async () => {
    if (!newAttributeKey.trim()) {
      message.warning('Please enter an attribute key')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('todo_attributs')
        .insert({
          todo_id: todoData.id,
          meta_key: newAttributeKey.trim(),
          meta_value: newAttributeValue.trim() || null,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          message.error('Attribute key already exists')
        } else {
          throw error
        }
        return
      }

      setAttributes([...attributes, data])
      setNewAttributeKey('')
      setNewAttributeValue('')
      message.success('Attribute added')
    } catch (error: any) {
      message.error(error.message || 'Failed to add attribute')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateAttribute = async (attributeId: string, newValue: string) => {
    try {
      const { error } = await supabase
        .from('todo_attributs')
        .update({
          meta_value: newValue.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', attributeId)

      if (error) throw error

      setAttributes(
        attributes.map((attr) =>
          attr.id === attributeId
            ? { ...attr, meta_value: newValue.trim() || null, updated_at: new Date().toISOString() }
            : attr
        )
      )
      setEditingAttribute(null)
      message.success('Attribute updated')
    } catch (error: any) {
      message.error(error.message || 'Failed to update attribute')
    }
  }

  const handleDeleteAttribute = async (attributeId: string) => {
    try {
      const { error } = await supabase
        .from('todo_attributs')
        .delete()
        .eq('id', attributeId)

      if (error) throw error

      setAttributes(attributes.filter((attr) => attr.id !== attributeId))
      message.success('Attribute deleted')
    } catch (error: any) {
      message.error(error.message || 'Failed to delete attribute')
    }
  }

  const completedChecklistCount = checklistItems.filter((item) => item.is_completed).length
  const totalChecklistCount = checklistItems.length

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Space style={{ marginBottom: 24 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/todos')}>
                Back to Todos
              </Button>
            </Space>

            <div style={{ marginBottom: 32 }}>
              <Title level={2} style={{ marginBottom: 8 }}>
                {todoData.title}
              </Title>
              <Space size="middle">
                <Tag color={getStatusColor(todoData.status)} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {getStatusLabel(todoData.status)}
                </Tag>
                <Tag color={getVisibilityColor(todoData.visibility)} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {todoData.visibility?.toUpperCase()}
                </Tag>
                {todoData.team && (
                  <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                    Team: {todoData.team.name}
                  </Tag>
                )}
              </Space>
            </div>

            <Divider />

            <Row gutter={[24, 24]}>
              <Col xs={24} lg={12}>
                <Card title="Basic Information" size="small">
                  <Descriptions column={1} bordered>
                    <Descriptions.Item label="Description">
                      <Paragraph>{todoData.description || 'No description'}</Paragraph>
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
                  </Descriptions>
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card title="Assignees" size="small" loading={loadingTeamMembers}>
                  {todoData.visibility === 'private' ? (
                    <Empty description="No Assignees this private todo" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : todoData.visibility === 'team' && todoData.team_id ? (
                    teamMembers.length > 0 ? (
                      <List
                        dataSource={teamMembers}
                        renderItem={(member: any) => (
                          <List.Item>
                            <Space>
                              <Avatar icon={<UserOutlined />} />
                              <Text>
                                {member.user?.full_name || member.user?.email || 'Unknown'}
                              </Text>
                              {member.role && (
                                <Tag color={member.role === 'manager' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                                  {member.role}
                                </Tag>
                              )}
                            </Space>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty description="No team members" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )
                  ) : (
                    todoData.assignees && todoData.assignees.length > 0 ? (
                      <List
                        dataSource={todoData.assignees}
                        renderItem={(assignee: any) => (
                          <List.Item>
                            <Space>
                              <Avatar icon={<UserOutlined />} />
                              <Text>
                                {assignee.user?.full_name || assignee.user?.email || 'Unknown'}
                              </Text>
                            </Space>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty description="No assignees" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )
                  )}
                </Card>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col xs={24}>
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
                                onChange={() => handleToggleChecklistItem(item.id, item.is_completed)}
                              >
                                <Text>{item.title}</Text>
                              </Checkbox>
                              <Popconfirm
                                title="Delete checklist item"
                                description="Are you sure?"
                                onConfirm={() => handleDeleteChecklistItem(item.id)}
                                okText="Yes"
                                cancelText="No"
                              >
                                <Button
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  size="small"
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
                        onChange={(e) => setNewChecklistTitle(e.target.value)}
                        onPressEnter={handleAddChecklistItem}
                      />
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAddChecklistItem}
                        loading={loading}
                      >
                        Add
                      </Button>
                    </Space.Compact>
                  </Space>
                </Card>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col xs={24}>
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
                                <Space>
                                  <Text strong>
                                    {comment.user?.full_name || comment.user?.email || 'Unknown'}
                                  </Text>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    <DateDisplay date={comment.created_at} />
                                  </Text>
                                </Space>
                              }
                              description={
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                  <Paragraph style={{ margin: 0 }}>{comment.comment}</Paragraph>
                                  {comment.user_id === currentUser.id && (
                                    <Popconfirm
                                      title="Delete comment"
                                      description="Are you sure?"
                                      onConfirm={() => handleDeleteComment(comment.id)}
                                      okText="Yes"
                                      cancelText="No"
                                    >
                                      <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        size="small"
                                      />
                                    </Popconfirm>
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
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={3}
                        style={{ resize: 'none' }}
                      />
                    </Space.Compact>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleAddComment}
                      loading={loading}
                    >
                      Add Comment
                    </Button>
                  </Space>
                </Card>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col xs={24}>
                <Card
                  title={
                    <Space>
                      <FileTextOutlined />
                      <Text strong>Attributes ({attributes.length})</Text>
                    </Space>
                  }
                  size="small"
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {attributes.length > 0 ? (
                      <Table
                        dataSource={attributes}
                        rowKey="id"
                        pagination={false}
                        columns={[
                          {
                            title: 'Key',
                            dataIndex: 'meta_key',
                            key: 'meta_key',
                            width: '30%',
                          },
                          {
                            title: 'Value',
                            dataIndex: 'meta_value',
                            key: 'meta_value',
                            render: (value: string, record: Attribute) => {
                              if (editingAttribute === record.id) {
                                return (
                                  <Space.Compact style={{ width: '100%' }}>
                                    <Input
                                      defaultValue={value || ''}
                                      onPressEnter={(e) => {
                                        handleUpdateAttribute(record.id, e.currentTarget.value)
                                      }}
                                      onBlur={(e) => {
                                        handleUpdateAttribute(record.id, e.target.value)
                                      }}
                                      autoFocus
                                    />
                                  </Space.Compact>
                                )
                              }
                              return (
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                  <Text>{value || <Text type="secondary">(empty)</Text>}</Text>
                                  <Button
                                    type="text"
                                    icon={<EditOutlined />}
                                    size="small"
                                    onClick={() => setEditingAttribute(record.id)}
                                  />
                                </Space>
                              )
                            },
                          },
                          {
                            title: 'Actions',
                            key: 'actions',
                            width: '100px',
                            render: (_: any, record: Attribute) => (
                              <Popconfirm
                                title="Delete attribute"
                                description="Are you sure?"
                                onConfirm={() => handleDeleteAttribute(record.id)}
                                okText="Yes"
                                cancelText="No"
                              >
                                <Button
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  size="small"
                                />
                              </Popconfirm>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <Empty description="No attributes" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        placeholder="Key"
                        value={newAttributeKey}
                        onChange={(e) => setNewAttributeKey(e.target.value)}
                        style={{ width: '30%' }}
                      />
                      <Input
                        placeholder="Value"
                        value={newAttributeValue}
                        onChange={(e) => setNewAttributeValue(e.target.value)}
                        style={{ width: '70%' }}
                        onPressEnter={handleAddAttribute}
                      />
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAddAttribute}
                        loading={loading}
                      >
                        Add
                      </Button>
                    </Space.Compact>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </Content>
      </Layout>
    </Layout>
  )
}
