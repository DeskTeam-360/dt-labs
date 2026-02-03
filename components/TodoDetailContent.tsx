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
    Modal,
    Select,
    DatePicker,
    Tabs,
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
    PlayCircleOutlined,
    StopOutlined,
    LinkOutlined,
    CopyOutlined,
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
const { Option } = Select

interface Screenshot {
    id: string
    file_name: string
    file_path: string
    file_url: string
    file_size: number
    mime_type: string
    todo_id: number | null
    title: string | null
    description: string | null
    created_at: string
    updated_at: string
}

interface TodoDetailContentProps {
    user: User
    todoData: any
    checklistItems: any[]
    comments: any[]
    attributes: any[]
    screenshots?: Screenshot[]
}

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
    user?: {
        id: string
        full_name: string | null
        email: string
    }
}

interface Attribute {
    id: string
    todo_id: number
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
    screenshots: initialScreenshots = [],
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
    const [editingComment, setEditingComment] = useState<string | null>(null)
    const [editingCommentValue, setEditingCommentValue] = useState('')
    const [editingAttribute, setEditingAttribute] = useState<string | null>(null)
    const [newAttributeKey, setNewAttributeKey] = useState('')
    const [newAttributeValue, setNewAttributeValue] = useState('')
    const [editingDescription, setEditingDescription] = useState(false)
    const [descriptionValue, setDescriptionValue] = useState(todoData.description || '')
    const [editModalVisible, setEditModalVisible] = useState(false)
    const [teams, setTeams] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
    const [form] = Form.useForm()
    const [activeTimeTracker, setActiveTimeTracker] = useState<any>(null)
    const [timeTrackerSessions, setTimeTrackerSessions] = useState<any[]>([])
    const [totalTimeSeconds, setTotalTimeSeconds] = useState<number>(0)
    const [currentTime, setCurrentTime] = useState<number>(0)

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

    // Sync descriptionValue with todoData.description
    useEffect(() => {
        if (!editingDescription) {
            setDescriptionValue(todoData.description || '')
        }
    }, [todoData.description, editingDescription])

    // Fetch teams and users for edit form
    useEffect(() => {
        const fetchTeams = async () => {
            try {
                const { data, error } = await supabase
                    .from('teams')
                    .select('*')
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

        fetchTeams()
        fetchUsers()
        fetchTimeTrackerSessions()
        checkActiveTimeTracker()
    }, [])

    // Check for active time tracker and update current time
    useEffect(() => {
        if (activeTimeTracker) {
            const interval = setInterval(() => {
                const elapsed = Math.floor((new Date().getTime() - new Date(activeTimeTracker.start_time).getTime()) / 1000)
                setCurrentTime(elapsed)
            }, 1000)
            return () => clearInterval(interval)
        } else {
            setCurrentTime(0)
        }
    }, [activeTimeTracker])

    // Fetch time tracker sessions
    const fetchTimeTrackerSessions = async () => {
        try {
            const { data, error } = await supabase
                .from('todo_time_tracker')
                .select(`
                    *,
                    user:users!todo_time_tracker_user_id_fkey(id, full_name, email)
                `)
                .eq('todo_id', todoData.id)
                .order('created_at', { ascending: false })

            if (error) throw error

            setTimeTrackerSessions(data || [])
            
            // Calculate total time
            const total = (data || []).reduce((sum: number, session: any) => {
                return sum + (session.duration_seconds || 0)
            }, 0)
            setTotalTimeSeconds(total)
        } catch (error: any) {
            console.error('Failed to fetch time tracker sessions:', error)
        }
    }

    // Check for active time tracker (stop_time is NULL)
    const checkActiveTimeTracker = async () => {
        try {
            const { data, error } = await supabase
                .from('todo_time_tracker')
                .select('*')
                .eq('todo_id', todoData.id)
                .eq('user_id', currentUser.id)
                .is('stop_time', null)
                .order('start_time', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (error) throw error

            if (data) {
                setActiveTimeTracker(data)
            } else {
                setActiveTimeTracker(null)
            }
        } catch (error: any) {
            console.error('Failed to check active time tracker:', error)
        }
    }

    // Start time tracker
    const handleStartTimeTracker = async () => {
        // Check if user has any active session (anywhere, not just this todo)
        try {
            const { data: activeSessions, error: checkError } = await supabase
                .from('todo_time_tracker')
                .select('id, todo_id')
                .eq('user_id', currentUser.id)
                .is('stop_time', null)

            if (checkError) throw checkError

            if (activeSessions && activeSessions.length > 0) {
                message.warning('You have an active time tracking session. Please stop it first before starting a new one.')
                return
            }

            setLoading(true)
            const { data, error } = await supabase
                .from('todo_time_tracker')
                .insert({
                    todo_id: todoData.id,
                    user_id: currentUser.id,
                    start_time: new Date().toISOString(),
                })
                .select()
                .single()

            if (error) throw error

            setActiveTimeTracker(data)
            message.success('Time tracker started')
        } catch (error: any) {
            message.error(error.message || 'Failed to start time tracker')
        } finally {
            setLoading(false)
        }
    }

    // Stop time tracker
    const handleStopTimeTracker = async () => {
        if (!activeTimeTracker) return

        setLoading(true)
        try {
            const stopTime = new Date().toISOString()
            const startTime = new Date(activeTimeTracker.start_time)
            const durationSeconds = Math.floor((new Date(stopTime).getTime() - startTime.getTime()) / 1000)

            const { error } = await supabase
                .from('todo_time_tracker')
                .update({
                    stop_time: stopTime,
                    duration_seconds: durationSeconds,
                })
                .eq('id', activeTimeTracker.id)

            if (error) throw error

            setActiveTimeTracker(null)
            setCurrentTime(0)
            message.success('Time tracker stopped')
            fetchTimeTrackerSessions()
        } catch (error: any) {
            message.error(error.message || 'Failed to stop time tracker')
        } finally {
            setLoading(false)
        }
    }

    // Format seconds to readable time
    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`
        } else {
            return `${secs}s`
        }
    }

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

    const handleUpdateComment = async (commentId: string) => {
        if (!editingCommentValue.trim()) {
            message.warning('Please enter a comment')
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase
                .from('todo_comments')
                .update({
                    comment: editingCommentValue.trim(),
                })
                .eq('id', commentId)

            if (error) throw error

            setComments(
                comments.map((comment) =>
                    comment.id === commentId ? { ...comment, comment: editingCommentValue.trim() } : comment
                )
            )
            setEditingComment(null)
            setEditingCommentValue('')
            message.success('Comment updated')
        } catch (error: any) {
            message.error(error.message || 'Failed to update comment')
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

    // Check if comment can be deleted (within 1 hour)
    const canDeleteComment = (createdAt: string) => {
        const commentTime = dayjs(createdAt)
        const oneHourAgo = dayjs().subtract(1, 'hour')
        return commentTime.isAfter(oneHourAgo)
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

    // Description/Note functions
    const handleUpdateDescription = async () => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('tickets')
                .update({
                    description: descriptionValue.trim() || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', todoData.id)

            if (error) throw error

            setEditingDescription(false)
            message.success('Description updated successfully')
            // Update todoData locally
            todoData.description = descriptionValue.trim() || null
        } catch (error: any) {
            message.error(error.message || 'Failed to update description')
        } finally {
            setLoading(false)
        }
    }

    const handleCancelEditDescription = () => {
        setDescriptionValue(todoData.description || '')
        setEditingDescription(false)
    }

    // Edit Todo functions
    const handleEditTodo = () => {
        setSelectedAssignees(todoData.assignees?.map((a: any) => a.user_id) || [])
        form.setFieldsValue({
            title: todoData.title,
            description: todoData.description || '',
            status: todoData.status,
            visibility: todoData.visibility,
            team_id: todoData.team_id,
            due_date: todoData.due_date ? dayjs(todoData.due_date) : null,
        })
        setEditModalVisible(true)
    }

    const handleUpdateTodo = async (values: any) => {
        setLoading(true)
        try {
            if (values.visibility === 'specific_users' && selectedAssignees.length === 0) {
                message.error('Please select at least one user for specific users visibility')
                return
            }

            if (values.visibility === 'team' && !values.team_id) {
                message.error('Please select a team for team visibility')
                return
            }

            const updateData = {
                title: values.title,
                description: values.description || null,
                status: values.status,
                visibility: values.visibility,
                team_id: values.team_id || null,
                due_date: values.due_date ? values.due_date.toISOString() : null,
                updated_at: new Date().toISOString(),
            }

            const { error } = await supabase
                .from('tickets')
                .update(updateData)
                .eq('id', todoData.id)

            if (error) throw error

            // Update assignees if visibility is specific_users
            if (values.visibility === 'specific_users') {
                await supabase
                    .from('todo_assignees')
                    .delete()
                    .eq('todo_id', todoData.id)

                if (selectedAssignees.length > 0) {
                    const assigneesToInsert = selectedAssignees.map((userId) => ({
                        todo_id: todoData.id,
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
                    .eq('todo_id', todoData.id)
            }

            message.success('Todo updated successfully')
            setEditModalVisible(false)

            // Reload page to get updated data
            router.refresh()
        } catch (error: any) {
            message.error(error.message || 'Failed to update todo')
        } finally {
            setLoading(false)
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
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
                                <Button
                                    type="primary"
                                    icon={<EditOutlined />}
                                    onClick={handleEditTodo}
                                >
                                    Edit Todo
                                </Button>
                            </div>
                        </div>

                        <Divider />

                        <Tabs
                            defaultActiveKey="general"
                            items={[
                                {
                                    key: 'general',
                                    label: 'General Info',
                                    children: (
                                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                            <Row gutter={[24, 24]}>
                                                <Col xs={24}>
                                                    {/* <Card title="Basic Information" size="small"> */}
                                                    <Descriptions column={1} bordered>
                                                        <Descriptions.Item label="Status">
                                                            <Tag color={getStatusColor(todoData.status)} style={{ fontSize: 14, padding: '4px 12px' }}>
                                                                {getStatusLabel(todoData.status)}
                                                            </Tag>
                                                        </Descriptions.Item>
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
                                                        </Descriptions.Item>
                                                    </Descriptions>
                                                </Col>
                                            </Row>

                                            <Row gutter={[24, 24]}>
                                                <Col xs={24}>
                                                    <Card
                                                        title={
                                                            <Space>
                                                                <ClockCircleOutlined />
                                                                <Text strong>Time Tracker</Text>
                                                            </Space>
                                                        }
                                                        size="small"
                                                    >
                                                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                                            <Space>
                                                                {activeTimeTracker ? (
                                                                    <>
                                                                        <Button
                                                                            type="primary"
                                                                            danger
                                                                            icon={<StopOutlined />}
                                                                            onClick={handleStopTimeTracker}
                                                                            loading={loading}
                                                                        >
                                                                            Stop
                                                                        </Button>
                                                                        <Text strong style={{ fontSize: 18 }}>
                                                                            {formatTime(currentTime)}
                                                                        </Text>
                                                                        <Text type="secondary">(running)</Text>
                                                                    </>
                                                                ) : (
                                                                    <Button
                                                                        type="primary"
                                                                        icon={<PlayCircleOutlined />}
                                                                        onClick={handleStartTimeTracker}
                                                                        loading={loading}
                                                                    >
                                                                        Start Timer
                                                                    </Button>
                                                                )}
                                                            </Space>

                                                            {timeTrackerSessions.length > 0 ? (
                                                                <List
                                                                    dataSource={timeTrackerSessions}
                                                                    renderItem={(session: any) => (
                                                                        <List.Item>
                                                                            <List.Item.Meta
                                                                                avatar={<Avatar icon={<UserOutlined />} />}
                                                                                title={
                                                                                    <Space>
                                                                                        <Text strong>
                                                                                            {session.user?.full_name || session.user?.email || 'Unknown'}
                                                                                        </Text>
                                                                                        {!session.stop_time && (
                                                                                            <Tag color="processing">Active</Tag>
                                                                                        )}
                                                                                    </Space>
                                                                                }
                                                                                description={
                                                                                    <Space direction="vertical" size={4}>
                                                                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                                                                            Started: <DateDisplay date={session.start_time} />
                                                                                        </Text>
                                                                                        {session.stop_time && (
                                                                                            <>
                                                                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                                                                    Stopped: <DateDisplay date={session.stop_time} />
                                                                                                </Text>
                                                                                                <Text strong>
                                                                                                    Duration: {formatTime(session.duration_seconds || 0)}
                                                                                                </Text>
                                                                                            </>
                                                                                        )}
                                                                                    </Space>
                                                                                }
                                                                            />
                                                                        </List.Item>
                                                                    )}
                                                                />
                                                            ) : (
                                                                <Empty description="No time tracking sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                                            )}
                                                        </Space>
                                                    </Card>
                                                </Col>
                                            </Row>

                                            <Row gutter={[24, 24]}>
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

                                            <Row gutter={[24, 24]}>
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
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                                                        <Space>
                                                                                            <Text strong>
                                                                                                {comment.user?.full_name || comment.user?.email || 'Unknown'}
                                                                                            </Text>
                                                                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                                                                <DateDisplay date={comment.created_at} />
                                                                                            </Text>
                                                                                        </Space>
                                                                                        {comment.user_id === currentUser.id && !editingComment && (
                                                                                            <Space>
                                                                                                <Button
                                                                                                    // type="text"
                                                                                                    icon={<EditOutlined />}
                                                                                                    size="middle"
                                                                                                    onClick={() => {
                                                                                                        setEditingComment(comment.id)
                                                                                                        setEditingCommentValue(comment.comment)
                                                                                                    }}
                                                                                                >
                                                                                                </Button>
                                                                                                {canDeleteComment(comment.created_at) && (
                                                                                                    <Popconfirm
                                                                                                        title="Delete comment"
                                                                                                        description="Are you sure?"
                                                                                                        onConfirm={() => handleDeleteComment(comment.id)}
                                                                                                        okText="Yes"
                                                                                                        cancelText="No"
                                                                                                    >
                                                                                                        <Button
                                                                                                            // type="text"
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
                                                                                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                                                                                        {editingComment === comment.id ? (
                                                                                            <Space direction="vertical" style={{ width: '100%' }} size="small">
                                                                                                <TextArea
                                                                                                    value={editingCommentValue}
                                                                                                    onChange={(e) => setEditingCommentValue(e.target.value)}
                                                                                                    rows={3}
                                                                                                    style={{ resize: 'none' }}
                                                                                                />
                                                                                                <Space>
                                                                                                    <Button
                                                                                                        type="primary"
                                                                                                        size="small"
                                                                                                        onClick={() => handleUpdateComment(comment.id)}
                                                                                                        loading={loading}
                                                                                                    >
                                                                                                        Save
                                                                                                    </Button>
                                                                                                    <Button
                                                                                                        size="small"
                                                                                                        onClick={() => {
                                                                                                            setEditingComment(null)
                                                                                                            setEditingCommentValue('')
                                                                                                        }}
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
                                        </Space>
                                    ),
                                },
                                {
                                    key: 'assignees',
                                    label: 'Assignees',
                                    children: (
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
                                    ),
                                },
                                {
                                    key: 'attributes',
                                    label: 'Additional Information',
                                    children: (
                                        // <Card
                                        //   title={
                                        //     <Space>
                                        //       <FileTextOutlined />
                                        //       <Text strong>Attributes ({attributes.length})</Text>
                                        //     </Space>
                                        //   }
                                        //   size="small"
                                        // >


                                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                            <Row gutter={[16, 16]} align="bottom">
                                                <Col xs={24} sm={10}>
                                                    <div>
                                                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                                            Key <Text type="danger">*</Text>
                                                        </Text>
                                                        <Input
                                                            placeholder="Key"
                                                            value={newAttributeKey}
                                                            onChange={(e) => setNewAttributeKey(e.target.value)}
                                                            onPressEnter={handleAddAttribute}
                                                        />
                                                    </div>
                                                </Col>
                                                <Col xs={24} sm={10}>
                                                    <div>
                                                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                                            Value <Text type="danger">*</Text>
                                                        </Text>
                                                        <Input
                                                            placeholder="Value"
                                                            value={newAttributeValue}
                                                            onChange={(e) => setNewAttributeValue(e.target.value)}
                                                            onPressEnter={handleAddAttribute}
                                                        />
                                                    </div>
                                                </Col>
                                                <Col xs={24} sm={4}>
                                                    <Button
                                                        type="primary"
                                                        icon={<PlusOutlined />}
                                                        onClick={handleAddAttribute}
                                                        loading={loading}
                                                        block
                                                        style={{ height: 32 }}
                                                    >
                                                        Add
                                                    </Button>
                                                </Col>
                                            </Row>

                                            {attributes.length > 0 ? (
                                                <Descriptions column={1} bordered style={{ marginTop: 16 }}>
                                                    {attributes.map((attr) => (
                                                        <Descriptions.Item
                                                            key={attr.id}
                                                            label={
                                                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                                                    <Text strong>{attr.meta_key}</Text>
                                                                    <Space>
                                                                        {editingAttribute === attr.id ? (
                                                                            <Button
                                                                                type="text"
                                                                                size="small"
                                                                                onClick={() => setEditingAttribute(null)}
                                                                            >
                                                                                Cancel
                                                                            </Button>
                                                                        ) : (
                                                                            <>
                                                                                <Button
                                                                                    color="green"
                                                                                    icon={<EditOutlined />}
                                                                                    size="middle"
                                                                                    onClick={() => setEditingAttribute(attr.id)}
                                                                                />
                                                                                <Popconfirm
                                                                                    title="Delete attribute"
                                                                                    description="Are you sure?"
                                                                                    onConfirm={() => handleDeleteAttribute(attr.id)}
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
                                                                </Space>
                                                            }
                                                        >
                                                            {editingAttribute === attr.id ? (
                                                                <Space.Compact style={{ width: '100%' }}>
                                                                    <Input
                                                                        defaultValue={attr.meta_value || ''}
                                                                        onPressEnter={(e) => {
                                                                            handleUpdateAttribute(attr.id, e.currentTarget.value)
                                                                        }}
                                                                        onBlur={(e) => {
                                                                            handleUpdateAttribute(attr.id, e.target.value)
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
                                                </Descriptions>
                                            ) : (
                                                <Empty description="No attributes" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                            )}

                                        </Space>
                                        // </Card>
                                    ),
                                },
                                {
                                    key: 'screenshots',
                                    label: `Screenshots (${initialScreenshots.length})`,
                                    children: (
                                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                            {initialScreenshots.length > 0 ? (
                                                <Row gutter={[16, 16]}>
                                                    {initialScreenshots.map((screenshot) => (
                                                        <Col xs={24} sm={12} md={8} lg={6} key={screenshot.id}>
                                                            <Card
                                                                hoverable
                                                                cover={
                                                                    <div style={{ height: 150, overflow: 'hidden', background: '#f5f5f5' }}>
                                                                        <img
                                                                            src={screenshot.file_url}
                                                                            alt={screenshot.title || screenshot.file_name}
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                        />
                                                                    </div>
                                                                }
                                                                actions={[
                                                                    <Button
                                                                        type="text"
                                                                        icon={<LinkOutlined />}
                                                                        onClick={() => window.open(screenshot.file_url, '_blank')}
                                                                    />,
                                                                    <Button
                                                                        type="text"
                                                                        icon={<CopyOutlined />}
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(screenshot.file_url)
                                                                            message.success('URL copied!')
                                                                        }}
                                                                    />,
                                                                ]}
                                                            >
                                                                <Card.Meta
                                                                    title={
                                                                        <Text ellipsis style={{ fontSize: 12 }}>
                                                                            {screenshot.title || screenshot.file_name}
                                                                        </Text>
                                                                    }
                                                                    description={
                                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                                            {dayjs(screenshot.created_at).format('YYYY-MM-DD HH:mm')}
                                                                        </Text>
                                                                    }
                                                                />
                                                            </Card>
                                                        </Col>
                                                    ))}
                                                </Row>
                                            ) : (
                                                <Empty 
                                                    description="No screenshots linked to this todo" 
                                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                />
                                            )}
                                        </Space>
                                    ),
                                },
                            ]}
                        />
                    </Card>

                    <Modal
                        title="Edit Todo"
                        open={editModalVisible}
                        onCancel={() => {
                            setEditModalVisible(false)
                            form.resetFields()
                            setSelectedAssignees([])
                        }}
                        footer={null}
                        width={700}
                    >
                        <Form form={form} layout="vertical" onFinish={handleUpdateTodo}>
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
                                    <Button type="primary" htmlType="submit" loading={loading}>
                                        Update
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            setEditModalVisible(false)
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
