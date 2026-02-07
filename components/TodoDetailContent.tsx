'use client'

import {
    Layout,
    Card,
    Tag,
    Typography,
    Button,
    Space,
    Row,
    Col,
    Divider,
    Input,
    Form,
    message,
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
    PaperClipOutlined,
    DeleteOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { uploadTicketFile } from '@/utils/storage'
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import { TabGeneral, TabAssignees, TabScreenshots } from './TodoDetail'
import CommentWysiwyg from './TodoDetail/CommentWysiwyg'
import dayjs from 'dayjs'

const { Content } = Layout
const { Title, Text } = Typography
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
    tags?: Array<{ id: string; name: string; slug: string; color?: string }>
}

interface ChecklistItem {
    id: string
    todo_id: number
    title: string
    is_completed: boolean
    order_index: number
    created_at: string
}

interface CommentAttachment {
    id: string
    file_url: string
    file_name: string
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

export default function TodoDetailContent({
    user: currentUser,
    todoData,
    checklistItems: initialChecklistItems,
    comments: initialComments,
    attributes: initialAttributes,
    screenshots: initialScreenshots = [],
    tags: initialTags = [],
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
    const [newCommentAttachments, setNewCommentAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
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
    const [ticketTypes, setTicketTypes] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
    const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
    const [allTags, setAllTags] = useState<Array<{ id: string; name: string; slug: string }>>([])
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTags.map((t) => t.id))
    const [descriptionAttachmentsFromDb, setDescriptionAttachmentsFromDb] = useState<{ id: string; file_url: string; file_name: string; file_path: string }[]>([])
    const [newDescriptionAttachments, setNewDescriptionAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
    const [deletedDescriptionAttachmentIds, setDeletedDescriptionAttachmentIds] = useState<string[]>([])
    const [statusChanging, setStatusChanging] = useState(false)
    const [typeChanging, setTypeChanging] = useState(false)
    const [companyChanging, setCompanyChanging] = useState(false)
    const [tagsChanging, setTagsChanging] = useState(false)
    const [form] = Form.useForm()
    const [activeTimeTracker, setActiveTimeTracker] = useState<any>(null)
    const [timeTrackerSessions, setTimeTrackerSessions] = useState<any[]>([])
    const [totalTimeSeconds, setTotalTimeSeconds] = useState<number>(0)
    const [currentTime, setCurrentTime] = useState<number>(0)
    const [statusesFromDb, setStatusesFromDb] = useState<{ slug: string; title: string; color: string }[]>([])

    const supabase = createClient()

    // Default status labels/colors when DB has no todo_statuses
    const DEFAULT_STATUS_MAP: Record<string, { title: string; color: string }> = {
        to_do: { title: 'To Do', color: 'default' },
        in_progress: { title: 'In Progress', color: 'processing' },
        completed: { title: 'Completed', color: 'success' },
        cancel: { title: 'Cancel', color: 'error' },
        archived: { title: 'Archived', color: 'default' },
    }
    const allStatusesForSelect = statusesFromDb.length > 0
        ? statusesFromDb
        : Object.entries(DEFAULT_STATUS_MAP).map(([slug, { title, color }]) => ({ slug, title, color }))

    useEffect(() => {
        const fetchStatuses = async () => {
            try {
                const { data, error } = await supabase
                    .from('todo_statuses')
                    .select('slug, title, color')
                    .order('sort_order', { ascending: true })
                if (!error && data?.length) {
                    setStatusesFromDb(data as { slug: string; title: string; color: string }[])
                }
            } catch {
                // use DEFAULT_STATUS_MAP via allStatusesForSelect
            }
        }
        fetchStatuses()
    }, [])

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

        const fetchTicketTypes = async () => {
            try {
                const { data, error } = await supabase
                    .from('ticket_types')
                    .select('id, title, slug, color')
                    .order('sort_order', { ascending: true })
                if (!error) setTicketTypes((data || []) as Array<{ id: number; title: string; slug: string; color: string }>)
            } catch {
                // ignore
            }
        }
        const fetchCompanies = async () => {
            try {
                const { data, error } = await supabase
                    .from('companies')
                    .select('id, name')
                    .order('name', { ascending: true })
                if (!error) setCompanies(data || [])
            } catch {
                // ignore
            }
        }
        const fetchTags = async () => {
            try {
                const { data, error } = await supabase
                    .from('tags')
                    .select('id, name, slug')
                    .order('name', { ascending: true })
                if (!error) setAllTags((data || []) as Array<{ id: string; name: string; slug: string }>)
            } catch {
                // ignore
            }
        }
        fetchTeams()
        fetchUsers()
        fetchTicketTypes()
        fetchCompanies()
        fetchTags()
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
            let durationSeconds = Math.floor((new Date(stopTime).getTime() - startTime.getTime()) / 1000)
            const MAX_DURATION = 2147483647
            if (durationSeconds > MAX_DURATION) durationSeconds = MAX_DURATION
            if (durationSeconds < 0) durationSeconds = 0

            const { error } = await supabase
                .from('todo_time_tracker')
                .update({
                    stop_time: stopTime,
                    duration_seconds: durationSeconds,
                })
                .eq('id', String(activeTimeTracker.id))

            if (error) throw error

            setActiveTimeTracker(null)
            setCurrentTime(0)
            message.success('Time tracker stopped')
            fetchTimeTrackerSessions()
        } catch (error: any) {
            message.error(error?.message || 'Failed to stop time tracker')
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
        const fromDb = statusesFromDb.find((s) => s.slug === status)
        if (fromDb?.color) return fromDb.color
        return DEFAULT_STATUS_MAP[status]?.color || 'default'
    }

    const getStatusLabel = (status: string) => {
        const fromDb = statusesFromDb.find((s) => s.slug === status)
        if (fromDb?.title) return fromDb.title
        return DEFAULT_STATUS_MAP[status]?.title || status
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
          user:users!todo_comments_user_id_fkey(id, full_name, email, avatar_url)
        `)
                .single()

            if (error) throw error

            if (newCommentAttachments.length > 0) {
                await supabase.from('comment_attachments').insert(
                    newCommentAttachments.map((a) => ({
                        comment_id: data.id,
                        file_url: a.url,
                        file_name: a.file_name,
                        file_path: a.file_path,
                        uploaded_by: currentUser.id,
                    }))
                )
            }

            setComments((prev) => [...prev, { ...data, comment_attachments: newCommentAttachments.map((a) => ({ id: '', file_url: a.url, file_name: a.file_name })) }])
            setNewComment('')
            setNewCommentAttachments([])
            message.success('Comment added')
        } catch (error: any) {
            message.error(error.message || 'Failed to add comment')
        } finally {
            setLoading(false)
        }
    }

    const handleCommentFilesSelected = async (files: FileList | null) => {
        if (!files?.length || !todoData?.id) return
        setLoading(true)
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const result = await uploadTicketFile(file, todoData.id, 'comments')
                if (result.url && result.path) {
                    setNewCommentAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
                } else if (result.error) {
                    message.error(`${file.name}: ${result.error}`)
                }
            }
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

    const handleStatusChange = async (newStatus: string) => {
        setStatusChanging(true)
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', todoData.id)
            if (error) throw error
            message.success('Status updated')
            todoData.status = newStatus
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update status')
        } finally {
            setStatusChanging(false)
        }
    }

    const handleTypeChange = async (typeId: number | null) => {
        setTypeChanging(true)
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ type_id: typeId, updated_at: new Date().toISOString() })
                .eq('id', todoData.id)
            if (error) throw error
            message.success('Type updated')
            todoData.type_id = typeId
            todoData.type = typeId != null ? ticketTypes.find((t) => t.id === typeId) ?? null : null
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update type')
        } finally {
            setTypeChanging(false)
        }
    }

    const handleCompanyChange = async (companyId: string | null) => {
        setCompanyChanging(true)
        try {
            const { error } = await supabase
                .from('tickets')
                .update({ company_id: companyId, updated_at: new Date().toISOString() })
                .eq('id', todoData.id)
            if (error) throw error
            message.success('Company updated')
            todoData.company_id = companyId
            todoData.company = companyId != null ? companies.find((c) => c.id === companyId) ?? null : null
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update company')
        } finally {
            setCompanyChanging(false)
        }
    }

    const handleTagsChange = async (tagIds: string[]) => {
        setTagsChanging(true)
        try {
            await supabase.from('ticket_tags').delete().eq('ticket_id', todoData.id)
            if (tagIds.length > 0) {
                const { error } = await supabase
                    .from('ticket_tags')
                    .insert(tagIds.map((tagId) => ({ ticket_id: todoData.id, tag_id: tagId })))
                if (error) throw error
            }
            message.success('Tags updated')
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update tags')
        } finally {
            setTagsChanging(false)
        }
    }

    // Edit Todo functions
    const handleEditTodo = () => {
        setSelectedAssignees(todoData.assignees?.map((a: any) => a.user_id) || [])
        setSelectedTagIds(initialTags.map((t) => t.id))
        setNewDescriptionAttachments([])
        setDeletedDescriptionAttachmentIds([])
        form.setFieldsValue({
            title: todoData.title,
            description: todoData.description || '',
            status: todoData.status,
            visibility: todoData.visibility,
            team_id: todoData.team_id,
            type_id: todoData.type_id ?? undefined,
            company_id: todoData.company_id ?? undefined,
            due_date: todoData.due_date ? dayjs(todoData.due_date) : null,
        })
        setEditModalVisible(true)
    }

    useEffect(() => {
        if (!editModalVisible || !todoData?.id) return
        const fetchDescAttachments = async () => {
            const { data } = await supabase
                .from('ticket_attachments')
                .select('id, file_url, file_name, file_path')
                .eq('ticket_id', todoData.id)
                .order('created_at', { ascending: true })
            setDescriptionAttachmentsFromDb(data || [])
        }
        fetchDescAttachments()
    }, [editModalVisible, todoData?.id])

    const handleDescriptionFilesSelected = async (files: FileList | null) => {
        if (!files?.length || !todoData?.id) return
        setLoading(true)
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const result = await uploadTicketFile(file, todoData.id, 'attachments')
                if (result.url && result.path) {
                    setNewDescriptionAttachments((prev) => [...prev, { url: result.url!, file_name: file.name, file_path: result.path! }])
                } else if (result.error) {
                    message.error(`${file.name}: ${result.error}`)
                }
            }
        } finally {
            setLoading(false)
        }
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
                type_id: values.type_id ?? null,
                company_id: values.company_id ?? null,
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

            await supabase.from('ticket_tags').delete().eq('ticket_id', todoData.id)
            if (selectedTagIds.length > 0) {
                await supabase.from('ticket_tags').insert(
                    selectedTagIds.map((tagId) => ({ ticket_id: todoData.id, tag_id: tagId }))
                )
            }

            if (deletedDescriptionAttachmentIds.length > 0) {
                await supabase.from('ticket_attachments').delete().in('id', deletedDescriptionAttachmentIds)
            }
            if (newDescriptionAttachments.length > 0) {
                await supabase.from('ticket_attachments').insert(
                    newDescriptionAttachments.map((a) => ({
                        ticket_id: todoData.id,
                        file_url: a.url,
                        file_name: a.file_name,
                        file_path: a.file_path,
                        uploaded_by: currentUser.id,
                    }))
                )
            }
            setNewDescriptionAttachments([])
            setDeletedDescriptionAttachmentIds([])
            const { data: refreshed } = await supabase
                .from('ticket_attachments')
                .select('id, file_url, file_name, file_path')
                .eq('ticket_id', todoData.id)
                .order('created_at', { ascending: true })
            setDescriptionAttachmentsFromDb(refreshed || [])

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
                            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/tickets')}>
                                Back to Todos
                            </Button>
                        </Space>

                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <Title level={2} style={{ marginBottom: 8 }}>
                                        {todoData.title}
                                    </Title>
                                    {/* <Space size="middle" wrap>
                                        <Tag color={getStatusColor(todoData.status)} style={{ fontSize: 14, padding: '4px 12px' }}>
                                            {getStatusLabel(todoData.status)}
                                        </Tag>
                                        {todoData.type && (
                                            <Tag color={todoData.type.color} style={{ fontSize: 14, padding: '4px 12px' }}>
                                                {todoData.type.title}
                                            </Tag>
                                        )}
                                        {todoData.company && (
                                            <Tag
                                                color={todoData.company.color ? undefined : 'cyan'}
                                                style={{
                                                  fontSize: 14,
                                                  padding: '4px 12px',
                                                  ...(todoData.company.color
                                                    ? { backgroundColor: todoData.company.color, borderColor: todoData.company.color, color: '#fff' }
                                                    : {}),
                                                }}
                                            >
                                                {todoData.company.name}
                                            </Tag>
                                        )}
                                        <Tag color={getVisibilityColor(todoData.visibility)} style={{ fontSize: 14, padding: '4px 12px' }}>
                                            {todoData.visibility?.toUpperCase()}
                                        </Tag>
                                        {todoData.team && (
                                            <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                                                Team: {todoData.team.name}
                                            </Tag>
                                        )}
                                        {initialTags.length > 0 &&
                                            initialTags.map((t) => (
                                                <Tag
                                                    key={t.id}
                                                    color={t.color ? undefined : 'default'}
                                                    style={{
                                                        fontSize: 14,
                                                        padding: '4px 12px',
                                                        ...(t.color
                                                            ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' }
                                                            : {}),
                                                    }}
                                                >
                                                    {t.name}
                                                </Tag>
                                            ))}
                                    </Space> */}
                                </div>
                                <Button
                                    type="primary"
                                    icon={<EditOutlined />}
                                    onClick={handleEditTodo}
                                >
                                    Edit Ticket
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
                                        <TabGeneral
                                            todoData={todoData}
                                            getStatusColor={getStatusColor}
                                            getStatusLabel={getStatusLabel}
                                            statusOptions={allStatusesForSelect}
                                            onStatusChange={handleStatusChange}
                                            statusChanging={statusChanging}
                                            typeOptions={ticketTypes}
                                            onTypeChange={handleTypeChange}
                                            typeChanging={typeChanging}
                                            companyOptions={companies}
                                            onCompanyChange={handleCompanyChange}
                                            companyChanging={companyChanging}
                                            tagOptions={allTags}
                                            selectedTagIds={initialTags.map((t) => t.id)}
                                            onTagsChange={handleTagsChange}
                                            tagsChanging={tagsChanging}
                                            totalTimeSeconds={totalTimeSeconds}
                                            activeTimeTracker={activeTimeTracker}
                                            currentTime={currentTime}
                                            formatTime={formatTime}
                                            checklistItems={checklistItems}
                                            totalChecklistCount={totalChecklistCount}
                                            completedChecklistCount={completedChecklistCount}
                                            newChecklistTitle={newChecklistTitle}
                                            onNewChecklistTitleChange={setNewChecklistTitle}
                                            onAddChecklistItem={handleAddChecklistItem}
                                            onToggleChecklistItem={handleToggleChecklistItem}
                                            onDeleteChecklistItem={handleDeleteChecklistItem}
                                            comments={comments}
                                            currentUserId={currentUser.id}
                                            editingComment={editingComment}
                                            editingCommentValue={editingCommentValue}
                                            onEditComment={(id, value) => {
                                                setEditingComment(id)
                                                setEditingCommentValue(value)
                                            }}
                                            onEditingCommentValueChange={setEditingCommentValue}
                                            onSaveEditComment={handleUpdateComment}
                                            onCancelEditComment={() => {
                                                setEditingComment(null)
                                                setEditingCommentValue('')
                                            }}
                                            onDeleteComment={handleDeleteComment}
                                            canDeleteComment={canDeleteComment}
                                            newComment={newComment}
                                            onNewCommentChange={setNewComment}
                                            newCommentAttachments={newCommentAttachments}
                                            onRemoveNewCommentAttachment={(i) => setNewCommentAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                                            onCommentFilesSelected={handleCommentFilesSelected}
                                            onAddComment={handleAddComment}
                                            addCommentLoading={loading}
                                            attributes={attributes}
                                            newAttributeKey={newAttributeKey}
                                            newAttributeValue={newAttributeValue}
                                            onNewAttributeKeyChange={setNewAttributeKey}
                                            onNewAttributeValueChange={setNewAttributeValue}
                                            onAddAttribute={handleAddAttribute}
                                            editingAttribute={editingAttribute}
                                            onEditingAttributeChange={setEditingAttribute}
                                            onUpdateAttribute={handleUpdateAttribute}
                                            onDeleteAttribute={handleDeleteAttribute}
                                            attributesLoading={loading}
                                        />
                                    ),
                                },
                                {
                                    key: 'assignees',
                                    label: 'Assignees',
                                    children: (
                                        <TabAssignees
                                            todoData={todoData}
                                            teamMembers={teamMembers}
                                            loading={loadingTeamMembers}
                                            totalTimeSeconds={totalTimeSeconds}
                                            activeTimeTracker={activeTimeTracker}
                                            currentTime={currentTime}
                                            formatTime={formatTime}
                                            timeTrackerSessions={timeTrackerSessions}
                                            timeTrackerLoading={loading}
                                            onStartTimeTracker={handleStartTimeTracker}
                                            onStopTimeTracker={handleStopTimeTracker}
                                        />
                                    ),
                                },
                                {
                                    key: 'screenshots',
                                    label: `Screenshots (${initialScreenshots.length})`,
                                    children: <TabScreenshots screenshots={initialScreenshots} />,
                                },
                            ]}
                        />
                    </Card>

                    <Modal
                        title="Edit Ticket"
                        open={editModalVisible}
                        onCancel={() => {
                            setEditModalVisible(false)
                            form.resetFields()
                            setSelectedAssignees([])
                            setSelectedTagIds(initialTags.map((t) => t.id))
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
                                <CommentWysiwyg ticketId={todoData?.id} placeholder="Todo Description" height="160px" />
                            </Form.Item>

                            <Form.Item label="Attachments">
                                <Space direction="vertical" style={{ width: '100%' }} size="small">
                                    {descriptionAttachmentsFromDb
                                        .filter((a) => !deletedDescriptionAttachmentIds.includes(a.id))
                                        .map((a) => (
                                            <Space key={a.id} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                <a href={a.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <PaperClipOutlined /> {a.file_name}
                                                </a>
                                                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeletedDescriptionAttachmentIds((prev) => [...prev, a.id])} />
                                            </Space>
                                        ))}
                                    {newDescriptionAttachments.map((a, i) => (
                                        <Space key={`new-${i}`} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                            <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <PaperClipOutlined /> {a.file_name}
                                            </a>
                                            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setNewDescriptionAttachments((prev) => prev.filter((_, idx) => idx !== i))} />
                                        </Space>
                                    ))}
                                    <input type="file" multiple style={{ display: 'none' }} id="edit-ticket-files-input" onChange={(e) => { handleDescriptionFilesSelected(e.target.files); e.target.value = '' }} />
                                    <Button icon={<PaperClipOutlined />} onClick={() => document.getElementById('edit-ticket-files-input')?.click()}>
                                        Attach files
                                    </Button>
                                </Space>
                            </Form.Item>

                            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                                <Select>
                                    {allStatusesForSelect.map((s) => (
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
                                    onChange={setSelectedTagIds}
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
                                            setSelectedTagIds(initialTags.map((t) => t.id))
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
