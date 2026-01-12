'use client'

import {
  Layout,
  Button,
  Space,
  Typography,
  Card,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Popconfirm,
  Tooltip,
  Avatar,
  Row,
  Col,
  Empty,
  Badge,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  UserOutlined,
  DragOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import dayjs from 'dayjs'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

interface TodosContentProps {
  user: User
}

interface TodoRecord {
  id: string
  title: string
  description: string | null
  created_by: string
  due_date: string | null
  status: 'to_do' | 'in_progress' | 'completed' | 'cancel' | 'archived'
  visibility: 'private' | 'team' | 'specific_users'
  team_id: string | null
  created_at: string
  updated_at: string
  creator_name?: string
  team_name?: string
  assignees?: Array<{ id: string; user_id: string; user_name?: string }>
  checklist_items?: Array<any>
  checklist_completed?: number
  checklist_total?: number
}

interface Team {
  id: string
  name: string
}

interface UserRecord {
  id: string
  full_name: string | null
  email: string
}

const statusColumns = [
  { id: 'to_do', title: 'To Do', color: '#faad14' },
  { id: 'in_progress', title: 'In Progress', color: '#1890ff' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
]

// Kanban Card Component
function KanbanCard({ todo, onEdit, onDelete }: { todo: TodoRecord; onEdit: (todo: TodoRecord) => void; onDelete: (id: string) => void }) {
  const router = useRouter()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const getVisibilityColor = (visibility: string) => {
    switch (visibility) {
      case 'private':
        return 'default'
      case 'team':
        return 'blue'
      case 'specific_users':
        return 'green'
      default:
        return 'default'
    }
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        size="small"
        style={{
          marginBottom: 12,
          cursor: 'grab',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        }}
        bodyStyle={{ padding: 12 }}
        {...listeners}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <Text 
            strong 
            style={{ fontSize: 14, flex: 1, cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/todos/${todo.id}`)
            }}
          >
            {todo.title} 
          </Text>
          <Space>
            <Tooltip title="View Details">
              <Button
                // type="text"
                color="blue"
                type="primary"
                variant="outlined"
                icon={<EyeOutlined />}
                size="large"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/todos/${todo.id}`)
                }}
              />
            </Tooltip>
            
            <Tooltip title="Edit">
              <Button
                // type="primary"
                color="green"
                icon={<EditOutlined />}
                size="large"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(todo)
                }}
              />
            </Tooltip>
            <Popconfirm
              title="Delete Todo"
              description="Are you sure?"
              onConfirm={(e) => {
                e?.stopPropagation()
                onDelete(todo.id)
              }}
              okText="Yes"
              cancelText="No"
            >
              <Button
                // type="text"
                danger
                size="large"
                icon={<DeleteOutlined />}
                // size="small"
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          </Space>
        </div>

        {todo.description && todo.description.length > 0 && (
          <Text
            type="secondary"
            ellipsis={{ tooltip: todo.description.length > 100 ? todo.description : false }}
            style={{ display: 'block', marginBottom: 8, fontSize: 12 }}
          >
            {todo.description.length > 100
              ? `${todo.description.slice(0, 100)}...`
              : todo.description}
          </Text>
        )}

        {Number(todo.checklist_total) > 0 ? (
          <Tag color="green" style={{ fontSize: 11, marginBottom: 8 }}>
            Checklist: {todo.checklist_completed}/{todo.checklist_total}
          </Tag>
        ) : null}


        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {todo.visibility!=='team' && (
          <Tag color={getVisibilityColor(todo.visibility)} style={{ fontSize: 11 }}>
              {todo.visibility === 'specific_users' ? 'Specific Users' : todo.visibility.toUpperCase()}
            </Tag>
          )}
          {todo.team_name && <Tag color="blue" style={{ fontSize: 11 }}>Team {todo.team_name}</Tag>}
        </Space>

        {todo.assignees && todo.assignees.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Avatar.Group size="small" maxCount={3}>
              {todo.assignees.map((assignee) => (
                <Tooltip key={assignee.id} title={assignee.user_name}>
                  <Avatar size="small" icon={<UserOutlined />} />
                </Tooltip>
              ))}
            </Avatar.Group>
          </div>
        )}


        {todo.due_date && (
          <div style={{ marginTop: 8 }}>
            <Tag
              color={dayjs(todo.due_date).isBefore(dayjs()) && todo.status !== 'completed' && todo.status !== 'cancel' ? 'error' : 'default'}
              style={{ fontSize: 11 }}
            >
              Due Date: <DateDisplay date={todo.due_date} />
            </Tag>
          </div>
        )}

{todo.updated_at && (
          <div style={{ marginTop: 8 }}>
            <Tag
              color={dayjs(todo.due_date).isBefore(dayjs()) && todo.status !== 'completed' && todo.status !== 'cancel' ? 'error' : 'default'}
              style={{ fontSize: 11 }}
            >
              
              Updated At: <DateDisplay date={todo.updated_at} />
            </Tag>
          </div>
        )}


        <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
          By {todo.creator_name}
        </div>
      </Card>
    </div>
  )
}

// Kanban Column Component
function KanbanColumn({
  column,
  todos,
  onEdit,
  onDelete,
}: {
  column: { id: string; title: string; color: string }
  todos: TodoRecord[]
  onEdit: (todo: TodoRecord) => void
  onDelete: (id: string) => void
}) {
  // Filter todos by status
  let columnTodos = todos.filter((todo) => todo.status === column.id)
  
  // For completed column, only show todos completed within last 7 days
  if (column.id === 'completed') {
    const sevenDaysAgo = dayjs().subtract(7, 'days')
    columnTodos = columnTodos.filter((todo) => {
      // Check if todo was updated to completed within last 7 days
      // We'll use updated_at to determine when it was completed
      const updatedDate = dayjs(todo.updated_at)
      return updatedDate.isAfter(sevenDaysAgo)
    })
  }
  
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <Col xs={24} sm={12} lg={24/3} style={{ marginBottom: 16 }}>
      <Card
        style={{
          height: 'calc(100vh - 200px)',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafafa',
          border: isOver ? `2px solid ${column.color}` : undefined,
        }}
        headStyle={{ backgroundColor: column.color }}
        bodyStyle={{ flex: 1, overflow: 'auto', padding: 0, position: 'relative' }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong>{column.title}</Text>
              <Badge count={columnTodos.length} style={{ backgroundColor: column.color }} />
            </Space>
          </div>
        }
      >
        <div
          ref={setNodeRef}
          style={{
            // position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: '100%',
            padding: 16,
            overflow: 'auto',
            // backgroundColor: 'rgba(255, 0, 0, 0.1)',
          }}
        >
          <SortableContext items={columnTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {columnTodos.length === 0 ? (
              <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description={`No ${column.title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <>
                {columnTodos.map((todo) => (
                  <KanbanCard key={todo.id} todo={todo} onEdit={onEdit} onDelete={onDelete} />
                ))}
                {/* <div style={{ minHeight: 200 }}></div> */}
              </>
            )}
          </SortableContext>
        </div>
      </Card>
    </Col>
  )
}

export default function TodosContent({ user: currentUser }: TodosContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [todos, setTodos] = useState<TodoRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTodo, setEditingTodo] = useState<TodoRecord | null>(null)
  const [form] = Form.useForm()
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const fetchTodos = async () => {
    setLoading(true)
    try {
      const { data: todosData, error: todosError } = await supabase
        .from('todos')
        .select(`
          *,
          creator:users!todos_created_by_fkey(id, full_name, email),
          team:teams(id, name)
        `)
        .order('created_at', { ascending: false })

      if (todosError) throw todosError

      const todosWithAssignees = await Promise.all(
        (todosData || []).map(async (todo: any) => {
          const { data: assigneesData } = await supabase
            .from('todo_assignees')
            .select(`
              *,
              user:users!todo_assignees_user_id_fkey(id, full_name, email)
            `)
            .eq('todo_id', todo.id)

          const { data: checklistData } = await supabase
            .from('todo_checklist')
            .select('*')
            .eq('todo_id', todo.id)

          const completedCount = (checklistData || []).filter((item: any) => item.is_completed).length
          const totalCount = checklistData?.length || 0

          return {
            ...todo,
            creator_name: todo.creator?.full_name || todo.creator?.email || 'Unknown',
            team_name: todo.team?.name || null,
            assignees: (assigneesData || []).map((assignee: any) => ({
              id: assignee.id,
              user_id: assignee.user_id,
              user_name: assignee.user?.full_name || assignee.user?.email || 'Unknown',
            })),
            checklist_items: checklistData || [],
            checklist_completed: completedCount,
            checklist_total: totalCount,
          }
        })
      )

      setTodos(todosWithAssignees as TodoRecord[])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch todos')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) throw error
      setTeams(data || [])
    } catch (error: any) {
      console.error('Failed to fetch teams:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .order('full_name', { ascending: true })

      if (error) throw error
      setUsers(data || [])
    } catch (error: any) {
      console.error('Failed to fetch users:', error)
    }
  }

  useEffect(() => {
    fetchTodos()
    fetchTeams()
    fetchUsers()
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    console.log('handleDragEnd', event)
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const todoId = active.id as string
    var newStatus = over.id as string

    // Check if status is valid
    if (!['to_do', 'in_progress', 'completed', 'cancel', 'archived'].includes(newStatus)) {
      // return
      const todo = todos.find((t) => t.id === newStatus)
      if (todo) {
        newStatus = todo?.status as string
      }else{
        return;
      }
    }


    // Optimistic update
    setTodos((prevTodos) =>
      prevTodos.map((t) => (t.id === todoId ? { ...t, status: newStatus as any } : t))
    )

    try {
      const { error } = await supabase
        .from('todos')
        .update({ status: newStatus })
        .eq('id', todoId)

      if (error) throw error

      message.success('Todo status updated successfully')
    } catch (error: any) {
      message.error(error.message || 'Failed to update todo status')
      // Revert optimistic update
      fetchTodos()
    }
  }

  const handleCreate = () => {
    setEditingTodo(null)
    setSelectedAssignees([])
    form.resetFields()
    form.setFieldsValue({
      status: 'to_do',
      visibility: 'private',
    })
    setModalVisible(true)
  }

  const handleEdit = (record: TodoRecord) => {
    setEditingTodo(record)
    setSelectedAssignees(record.assignees?.map((a) => a.user_id) || [])
    form.setFieldsValue({
      title: record.title,
      description: record.description || '',
      status: record.status,
      visibility: record.visibility,
      team_id: record.team_id,
      due_date: record.due_date ? dayjs(record.due_date) : null,
    })
    setModalVisible(true)
  }

  const handleDelete = async (todoId: string) => {
    try {
      const { error: assigneesError } = await supabase
        .from('todo_assignees')
        .delete()
        .eq('todo_id', todoId)

      if (assigneesError) throw assigneesError

      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', todoId)

      if (error) throw error

      message.success('Todo deleted successfully')
      fetchTodos()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete todo')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      if (values.visibility === 'specific_users' && selectedAssignees.length === 0) {
        message.error('Please select at least one user for specific users visibility')
        return
      }

      if (values.visibility === 'team' && !values.team_id) {
        message.error('Please select a team for team visibility')
        return
      }

      const todoData = {
        title: values.title,
        description: values.description || null,
        status: values.status,
        visibility: values.visibility,
        team_id: values.team_id || null,
        due_date: values.due_date ? values.due_date.toISOString() : null,
      }

      if (editingTodo) {
        const { error } = await supabase
          .from('todos')
          .update(todoData)
          .eq('id', editingTodo.id)

        if (error) throw error

        if (values.visibility === 'specific_users') {
          await supabase
            .from('todo_assignees')
            .delete()
            .eq('todo_id', editingTodo.id)

          if (selectedAssignees.length > 0) {
            const assigneesToInsert = selectedAssignees.map((userId) => ({
              todo_id: editingTodo.id,
              user_id: userId,
            }))

            const { error: assigneesError } = await supabase
              .from('todo_assignees')
              .insert(assigneesToInsert)

            if (assigneesError) throw assigneesError
          }
        } else {
          await supabase
            .from('todo_assignees')
            .delete()
            .eq('todo_id', editingTodo.id)
        }

        message.success('Todo updated successfully')
      } else {
        const { data: newTodo, error } = await supabase
          .from('todos')
          .insert({
            ...todoData,
            created_by: currentUser.id,
          })
          .select()
          .single()

        if (error) throw error

        if (values.visibility === 'specific_users' && selectedAssignees.length > 0) {
          const assigneesToInsert = selectedAssignees.map((userId) => ({
            todo_id: newTodo.id,
            user_id: userId,
          }))

          const { error: assigneesError } = await supabase
            .from('todo_assignees')
            .insert(assigneesToInsert)

          if (assigneesError) throw assigneesError
        }

        message.success('Todo created successfully')
      }

      setModalVisible(false)
      form.resetFields()
      setSelectedAssignees([])
      fetchTodos()
    } catch (error: any) {
      message.error(error.message || 'Failed to save todo')
    }
  }

  const activeTodo = activeId ? todos.find((t) => t.id === activeId) : null

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Title level={2} style={{ margin: 0 }}>
                My Tasks
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} loading={loading}>
                Add Todo
              </Button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <Row gutter={[16, 16]}>
                {statusColumns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    todos={todos}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </Row>

              <DragOverlay>
                {activeTodo ? (
                  <Card
                    size="small"
                    style={{
                      width: 280,
                      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    }}
                    bodyStyle={{ padding: 12 }}
                  >
                    <Text strong>{activeTodo.title}</Text>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
          </Card>

          <Modal
            title={editingTodo ? 'Edit Todo' : 'Create Todo'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
              setSelectedAssignees([])
            }}
            footer={null}
            width={700}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Please enter todo title!' }]}
              >
                <Input placeholder="Todo Title" />
              </Form.Item>

              <Form.Item name="description" label="Description">
                <TextArea rows={4} placeholder="Todo Description" />
              </Form.Item>

              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select>
                  <Option value="to_do">To Do</Option>
                  <Option value="in_progress">In Progress</Option>
                  <Option value="completed">Completed</Option>
                  <Option value="cancel">Cancel</Option>
                  <Option value="archived">Archived</Option>
                </Select>
              </Form.Item>

              <Form.Item name="visibility" label="Visibility" rules={[{ required: true }]}>
                <Select
                  onChange={(value) => {
                    if (value !== 'specific_users') {
                      setSelectedAssignees([])
                    }
                  }}
                >
                  <Option value="private">Private</Option>
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
                        onChange={setSelectedAssignees}
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
                  <Button
                    onClick={() => {
                      setModalVisible(false)
                      form.resetFields()
                      setSelectedAssignees([])
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </Layout>
    </Layout>
  )
}
