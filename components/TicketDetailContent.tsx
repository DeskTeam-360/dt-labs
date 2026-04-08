'use client'

import 'react-quill-new/dist/quill.snow.css'

import {
    Layout,
    Card,
    Tag,
    Typography,
    Button,
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
    Flex,
    notification,
    Tooltip,
} from 'antd'
import {
    ArrowLeftOutlined,
    WarningOutlined,
    WarningTwoTone,
    DeleteOutlined,
    DeleteTwoTone,
} from '@ant-design/icons'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { uploadTicketFile } from '@/utils/storage'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...options,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import AdminSidebar from './AdminSidebar'
import DateDisplay from './DateDisplay'
import { TabGeneral, TabTimeTracker, TabScreenshots, TabActivity } from './TicketDetail'
import TabGeneralCustomer from './TicketDetail/TabGeneralCustomer'
import CommentWysiwyg from './TicketDetail/CommentWysiwyg'
import TicketPresenceBar from './TicketPresenceBar'
import AdminMainColumn from './AdminMainColumn'
import dayjs from 'dayjs'
import { isAdmin } from '@/lib/auth-utils'
import { useTicketDetailLiveSync } from '@/lib/firebase/useTicketDetailLiveSync'

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
    ticket_id: number | null
    title: string | null
    description: string | null
    created_at: string
    updated_at: string
}

export interface TicketDetailContentProps {
    user: { id: string; email?: string | null; name?: string | null; image?: string | null; role?: string }
    ticketData: any
    checklistItems: any[]
    comments: any[]
    attributes: any[]
    screenshots?: Screenshot[]
    tags?: Array<{ id: string; name: string; slug: string; color?: string }>
    /** Emails ever CC'd on this ticket - used to pre-fill CC on replies */
    ticketCcEmails?: string[]
    /** More comments exist older than the initial window */
    commentsHasOlder?: boolean
    /** Cursor for GET .../comments/older */
    commentsOlderCursor?: { created_at: string; id: string } | null
    /** Count of comments older than the loaded window (same visibility rules as list) */
    commentsOlderRemaining?: number
    /** 'customer' = navbar layout, back to /customer; 'admin' = sidebar layout (default) */
    variant?: 'admin' | 'customer'
}

interface ChecklistItem {
    id: string
    ticket_id: number
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
    ticket_id: number
    user_id: string
    comment: string
    created_at: string
    visibility?: 'note' | 'reply'
    author_type?: 'customer' | 'agent' | 'automation'
    user?: {
        id: string
        full_name: string | null
        email: string
    }
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

export default function TicketDetailContent({
    user: currentUser,
    ticketData,
    checklistItems: initialChecklistItems,
    comments: initialComments,
    attributes: initialAttributes,
    screenshots: initialScreenshots = [],
    tags: initialTags = [],
    ticketCcEmails: initialTicketCcEmails = [],
    commentsHasOlder: initialCommentsHasOlder = false,
    commentsOlderCursor: initialCommentsOlderCursor = null,
    commentsOlderRemaining: initialCommentsOlderRemaining = 0,
    variant = 'admin',
}: TicketDetailContentProps) {
    const router = useRouter()
    const [displayTicket, setDisplayTicket] = useState(ticketData)
    const liveSyncTicketIdRef = useRef<number | undefined>(ticketData?.id)
    liveSyncTicketIdRef.current = displayTicket?.id
    const [screenshots, setScreenshots] = useState(initialScreenshots)
    const [ticketCcEmailsState, setTicketCcEmailsState] = useState(initialTicketCcEmails)

    useEffect(() => {
        setDisplayTicket(ticketData)
    }, [ticketData])

    useEffect(() => {
        setScreenshots(initialScreenshots)
        setTicketCcEmailsState(initialTicketCcEmails)
    }, [ticketData?.id, initialScreenshots, initialTicketCcEmails])

    const [collapsed, setCollapsed] = useState(false)
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(initialChecklistItems)
    const [comments, setComments] = useState<Comment[]>(initialComments)
    const [commentsHasOlder, setCommentsHasOlder] = useState(initialCommentsHasOlder)
    const [olderCursor, setOlderCursor] = useState<{ created_at: string; id: string } | null>(
        initialCommentsOlderCursor,
    )
    const [loadingMoreComments, setLoadingMoreComments] = useState(false)
    const [commentsOlderRemaining, setCommentsOlderRemaining] = useState(initialCommentsOlderRemaining)
    const [attributes, setAttributes] = useState<Attribute[]>(initialAttributes)

    useEffect(() => {
        setCommentsHasOlder(initialCommentsHasOlder)
        setOlderCursor(initialCommentsOlderCursor)
        setCommentsOlderRemaining(initialCommentsOlderRemaining)
    }, [ticketData?.id, initialCommentsHasOlder, initialCommentsOlderCursor, initialCommentsOlderRemaining])

    const [loading, setLoading] = useState(false)
    const [classifyLoading, setClassifyLoading] = useState<'support' | 'spam' | 'trash' | null>(null)
    const [newChecklistTitle, setNewChecklistTitle] = useState('')
    const [commentVisibility, setCommentVisibility] = useState<'note' | 'reply' | null>(null)
    useEffect(() => {
        setCommentVisibility(null)
    }, [displayTicket?.id])
    const [editingComment, setEditingComment] = useState<string | null>(null)
    const [editingCommentValue, setEditingCommentValue] = useState('')
    const [editingAttribute, setEditingAttribute] = useState<string | null>(null)
    const [newAttributeKey, setNewAttributeKey] = useState('')
    const [newAttributeValue, setNewAttributeValue] = useState('')
    const [editingDescription, setEditingDescription] = useState(false)
    const editingDescriptionRef = useRef(false)
    useEffect(() => {
        editingDescriptionRef.current = editingDescription
    }, [editingDescription])
    const [descriptionValue, setDescriptionValue] = useState(() => (typeof ticketData?.description === 'string' ? ticketData.description : '') || '')
    const [editModalVisible, setEditModalVisible] = useState(false)
    const [teams, setTeams] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [companyCustomers, setCompanyCustomers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
    const [ticketTypes, setTicketTypes] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
    const [ticketPriorities, setTicketPriorities] = useState<Array<{ id: number; title: string; slug: string; color: string }>>([])
    const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
    const [allTags, setAllTags] = useState<Array<{ id: string; name: string; slug: string }>>([])
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => (Array.isArray(initialTags) ? initialTags.map((t) => t?.id).filter(Boolean) as string[] : []))
    const [descriptionAttachmentsFromDb, setDescriptionAttachmentsFromDb] = useState<{ id: string; file_url: string; file_name: string; file_path: string }[]>([])
    const [newDescriptionAttachments, setNewDescriptionAttachments] = useState<{ url: string; file_name: string; file_path: string }[]>([])
    const [deletedDescriptionAttachmentIds, setDeletedDescriptionAttachmentIds] = useState<string[]>([])
    const [statusChanging, setStatusChanging] = useState(false)
    const [typeChanging, setTypeChanging] = useState(false)
    const [priorityChanging, setPriorityChanging] = useState(false)
    const [companyChanging, setCompanyChanging] = useState(false)
    const [tagsChanging, setTagsChanging] = useState(false)
    const [dueDateChanging, setDueDateChanging] = useState(false)
    const [form] = Form.useForm()
    const [activeTimeTracker, setActiveTimeTracker] = useState<any>(null)
    const [timeTrackerSessions, setTimeTrackerSessions] = useState<any[]>([])
    const [totalTimeSeconds, setTotalTimeSeconds] = useState<number>(0)
    const [currentTime, setCurrentTime] = useState<number>(0)
    const [statusesFromDb, setStatusesFromDb] = useState<{ slug: string; title: string; color: string }[]>([])
    const [assigneesChanging, setAssigneesChanging] = useState(false)
    const [teamChanging, setTeamChanging] = useState(false)
    const [visibilityChanging, setVisibilityChanging] = useState(false)
    const [shortNoteChanging, setShortNoteChanging] = useState(false)
    const [optimisticVisibility, setOptimisticVisibility] = useState<string | null>(null)
    const [optimisticAssignees, setOptimisticAssignees] = useState<string[] | null>(null)

    // Sync optimistic assignees when server data catches up
    useEffect(() => {
        const serverIds = (displayTicket?.assignees || []).map((a: any) => a.user_id || a.user?.id).filter(Boolean) as string[]
        if (optimisticAssignees && JSON.stringify([...serverIds].sort()) === JSON.stringify([...optimisticAssignees].sort())) {
            setOptimisticAssignees(null)
        }
    }, [displayTicket?.assignees, optimisticAssignees])

    // Sync optimistic visibility when server data catches up
    useEffect(() => {
        if (optimisticVisibility && displayTicket?.visibility === optimisticVisibility) {
            setOptimisticVisibility(null)
        }
    }, [displayTicket?.visibility, optimisticVisibility])

    // Mark ticket as read when user views it
    useEffect(() => {
        if (!displayTicket?.id) return
        apiFetch(`/api/tickets/${displayTicket.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mark_read: true }),
        }).catch(() => {})
    }, [displayTicket?.id])

    const VISIBILITY_OPTIONS = [
        { value: 'private', label: 'Private' },
        { value: 'team', label: 'Team' },
        { value: 'specific_users', label: 'Specific Users' },
        { value: 'public', label: 'Public' },
    ]

    // Default status labels/colors when DB has no ticket_statuses
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
                const data = await apiFetch<{ statuses: Array<{ slug: string; title: string; color: string }> }>('/api/tickets/lookup')
                if (data?.statuses?.length) {
                    setStatusesFromDb(data.statuses)
                }
            } catch {
                // use DEFAULT_STATUS_MAP via allStatusesForSelect
            }
        }
        fetchStatuses()
    }, [])

    // Inbox sync: use cron POST /api/email/sync-inbox (not on each ticket open).

    // Sync descriptionValue with ticketData.description (only when not editing and value actually changed)
    const descriptionFromProps = typeof displayTicket?.description === 'string' ? displayTicket.description : ''
    useEffect(() => {
        if (!editingDescription) {
            setDescriptionValue((prev: string) => (prev !== descriptionFromProps ? descriptionFromProps : prev))
        }
    }, [descriptionFromProps, editingDescription])

    // Fetch teams and users for edit form
    useEffect(() => {
        const fetchLookup = async () => {
            try {
                const data = await apiFetch<{ teams: any[]; users: any[]; ticketTypes: any[]; ticketPriorities: any[]; companies: any[]; tags: any[] }>('/api/tickets/lookup')
                setTeams(data?.teams || [])
                setUsers(data?.users || [])
                setTicketTypes(data?.ticketTypes || [])
                setTicketPriorities(data?.ticketPriorities || [])
                setCompanies(data?.companies || [])
                setAllTags((data?.tags || []).map((t: any) => ({ id: t.id, name: t.name, slug: t.slug })))
            } catch { /* ignore */ }
        }
        const fetchTimeTrackerSessions = async () => {
            try {
                const data = await apiFetch<any[]>(`/api/tickets/${displayTicket.id}/time-tracker`)
                setTimeTrackerSessions(data || [])
                const total = (data || []).reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0)
                setTotalTimeSeconds(total)
            } catch { /* ignore */ }
        }
        const checkActiveTimeTracker = async () => {
            try {
                const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/time-tracker?active=1`)
                setActiveTimeTracker(data || null)
            } catch { setActiveTimeTracker(null) }
        }
        const fetchCompanyUsers = async () => {
            const cid = displayTicket?.company_id
            if (!cid) {
                setCompanyCustomers([])
                return
            }
            try {
                const data = await apiFetch<{ users: Array<{ id: string; full_name: string | null; email: string }> }>(
                    `/api/companies/${cid}/users`
                )
                setCompanyCustomers(data?.users || [])
            } catch {
                setCompanyCustomers([])
            }
        }
        fetchLookup()
        fetchTimeTrackerSessions()
        checkActiveTimeTracker()
        fetchCompanyUsers()
    }, [displayTicket?.id, displayTicket?.company_id])

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

    const fetchTimeTrackerSessions = async () => {
        try {
            const data = await apiFetch<any[]>(`/api/tickets/${displayTicket.id}/time-tracker`)
            setTimeTrackerSessions(data || [])
            const total = (data || []).reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0)
            setTotalTimeSeconds(total)
        } catch { /* ignore */ }
    }

    const refreshTimeTracking = async () => {
        await fetchTimeTrackerSessions()
        try {
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/time-tracker?active=1`)
            setActiveTimeTracker(data || null)
        } catch {
            setActiveTimeTracker(null)
        }
    }

    /** Dipanggil saat Firestore `ticket_data_sync/{id}` berubah: ambil ulang detail + komentar dari API. */
    const mergeDetailFromServer = useCallback(async () => {
        const id = liveSyncTicketIdRef.current
        if (!id) return
        try {
            const data = await apiFetch<{
                ticketData: any
                checklistItems: ChecklistItem[]
                comments: Comment[]
                comments_has_older?: boolean
                comments_older_cursor?: { created_at: string; id: string } | null
                comments_older_remaining?: number
                attributes: Attribute[]
                screenshots?: Screenshot[]
                tags?: Array<{ id: string; name: string; slug: string; color?: string }>
                ticketCcEmails?: string[]
            }>(`/api/tickets/${id}/detail`)
            setDisplayTicket(data.ticketData)
            setChecklistItems(data.checklistItems)
            setComments(data.comments)
            if (data.comments_has_older !== undefined) setCommentsHasOlder(data.comments_has_older)
            if (data.comments_older_cursor !== undefined) setOlderCursor(data.comments_older_cursor ?? null)
            if (data.comments_older_remaining !== undefined) setCommentsOlderRemaining(data.comments_older_remaining)
            setAttributes(data.attributes)
            setScreenshots(data.screenshots ?? [])
            setTicketCcEmailsState(data.ticketCcEmails ?? [])
            setSelectedTagIds((data.tags ?? []).map((t) => t.id).filter(Boolean))
            if (!editingDescriptionRef.current) {
                setDescriptionValue(
                    typeof data.ticketData?.description === 'string' ? data.ticketData.description : '',
                )
            }
            setOptimisticAssignees(null)
            setOptimisticVisibility(null)
            await refreshTimeTracking()
            try {
                const att = await apiFetch<
                    Array<{ id: string; file_url: string; file_name: string; file_path?: string }>
                >(`/api/tickets/${id}/attachments`)
                setDescriptionAttachmentsFromDb((att || []).map((a) => ({ ...a, file_path: a.file_path ?? '' })))
            } catch {
                /* ignore */
            }
        } catch (e) {
            console.error('[ticket live sync] refetch failed', e)
        }
    }, [variant])

    // User membuka ticket ini → onSnapshot ke ticket_data_sync/{id}; versi naik → mergeDetailFromServer.
    useTicketDetailLiveSync(displayTicket?.id, mergeDetailFromServer)

    const handleLoadMoreComments = async () => {
        if (!olderCursor || !displayTicket?.id) return
        setLoadingMoreComments(true)
        try {
            const q = new URLSearchParams({
                before_created_at: olderCursor.created_at,
                before_id: olderCursor.id,
                limit: '10',
            })
            const res = await apiFetch<{
                comments: Comment[]
                comments_has_older: boolean
                comments_older_cursor: { created_at: string; id: string } | null
                comments_older_remaining: number
            }>(`/api/tickets/${displayTicket.id}/comments/older?${q}`)
            setComments((prev) => [...res.comments, ...prev])
            setCommentsHasOlder(res.comments_has_older)
            setOlderCursor(res.comments_older_cursor)
            setCommentsOlderRemaining(res.comments_older_remaining)
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : 'Failed to load older comments')
        } finally {
            setLoadingMoreComments(false)
        }
    }

    const handleStartTimeTracker = async () => {
        setLoading(true)
        try {
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/time-tracker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start' }),
            })
            setActiveTimeTracker(data)
            message.success('Time tracker started')
        } catch (err: any) {
            message.error(err?.message || 'Failed to start time tracker')
        } finally {
            setLoading(false)
        }
    }

    const handleStopTimeTracker = async () => {
        if (!activeTimeTracker) return
        setLoading(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/time-tracker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop', session_id: activeTimeTracker.id }),
            })
            setActiveTimeTracker(null)
            setCurrentTime(0)
            message.success('Time tracker stopped')
            fetchTimeTrackerSessions()
        } catch (err: any) {
            message.error(err?.message || 'Failed to stop time tracker')
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
            specific_users: 'lime',
            public: 'green',
        }
        return colorMap[visibility] || 'default'
    }

    const handleAddChecklistItem = async () => {
        if (!newChecklistTitle.trim()) {
            message.warning('Please enter a checklist item title')
            return
        }
        setLoading(true)
        try {
            const maxOrder = checklistItems.length > 0 ? Math.max(...checklistItems.map((item) => item.order_index)) : -1
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/checklist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newChecklistTitle.trim(), order_index: maxOrder + 1 }),
            })
            setChecklistItems([...checklistItems, { ...data, order_index: data.order_index ?? 0 }])
            setNewChecklistTitle('')
            message.success('Checklist item added')
        } catch (err: any) {
            message.error(err?.message || 'Failed to add checklist item')
        } finally {
            setLoading(false)
        }
    }

    const handleToggleChecklistItem = async (itemId: string, currentStatus: boolean) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/checklist/${itemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_completed: !currentStatus }),
            })
            setChecklistItems(checklistItems.map((item) => (item.id === itemId ? { ...item, is_completed: !currentStatus } : item)))
        } catch (err: any) {
            message.error(err?.message || 'Failed to update checklist item')
        }
    }

    const handleDeleteChecklistItem = async (itemId: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/checklist/${itemId}`, { method: 'DELETE' })
            setChecklistItems(checklistItems.filter((item) => item.id !== itemId))
            message.success('Checklist item deleted')
        } catch (err: any) {
            message.error(err?.message || 'Failed to delete checklist item')
        }
    }

    const handleAddComment = async (
        commentText: string,
        attachments: { url: string; file_name: string; file_path: string }[],
        extra?: { taggedUserIds?: string[]; ccEmails?: string[]; bccEmails?: string[] }
    ) => {
        if (!commentText.trim() && attachments.length === 0) {
            message.warning('Please enter a comment or attach files')
            return
        }
        if (variant === 'admin' && (commentVisibility !== 'note' && commentVisibility !== 'reply')) {
            message.warning('Pilih Add note atau Reply dulu')
            return
        }
        setLoading(true)
        try {
            const visibility = variant === 'customer' ? 'reply' : commentVisibility
            const author_type = variant === 'customer' ? 'customer' : 'agent'
            const payload: Record<string, unknown> = {
                comment: (commentText || '').trim(),
                visibility,
                author_type,
                attachments: attachments.map((a) => ({ file_url: a.url, file_name: a.file_name, file_path: a.file_path })),
            }
            if (extra?.taggedUserIds?.length) payload.tagged_user_ids = extra.taggedUserIds
            if (extra?.ccEmails?.length) payload.cc_emails = extra.ccEmails
            if (extra?.bccEmails?.length) payload.bcc_emails = extra.bccEmails
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            setComments((prev) => [...prev, { ...data, comment_attachments: data.comment_attachments || [] }])
            message.success('Comment added')
            if (variant === 'admin') setCommentVisibility(null)

            const replyRecipientEmail =
                (typeof displayTicket.creator?.email === 'string' && displayTicket.creator.email.trim()) ||
                (typeof displayTicket.company?.email === 'string' && displayTicket.company.email.trim()) ||
                ''
            if (variant === 'admin' && visibility === 'reply' && author_type === 'agent' && replyRecipientEmail) {
                try {
                    const res = await fetch('/api/email/send-reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ticketId: displayTicket.id,
                            commentBody: commentText.trim(),
                            ticketTitle: displayTicket.title,
                            toEmail: replyRecipientEmail,
                            ccEmails: extra?.ccEmails ?? [],
                            bccEmails: extra?.bccEmails ?? [],
                            attachments: attachments.map((a) => ({
                                file_url: a.url,
                                file_name: a.file_name,
                                file_path: a.file_path,
                            })),
                        }),
                    })
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        message.warning('Balasan dikirim, tapi email ke pelanggan gagal: ' + (err?.error || res.statusText))
                    }
                } catch {
                    message.warning('Balasan dikirim, tapi email ke pelanggan gagal.')
                }
            }
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
            await apiFetch(`/api/tickets/${displayTicket.id}/comments/${commentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: editingCommentValue.trim() }),
            })
            setComments(comments.map((c) => (c.id === commentId ? { ...c, comment: editingCommentValue.trim() } : c)))
            setEditingComment(null)
            setEditingCommentValue('')
            message.success('Comment updated')
        } catch (err: any) {
            message.error(err?.message || 'Failed to update comment')
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteComment = async (commentId: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/comments/${commentId}`, { method: 'DELETE' })
            setComments(comments.filter((c) => c.id !== commentId))
            message.success('Comment deleted')
        } catch (err: any) {
            message.error(err?.message || 'Failed to delete comment')
        }
    }

    // Check if comment can be deleted (within 1 hour)
    const canDeleteComment = (createdAt: string) => {
        const commentTime = dayjs(createdAt)
        const oneHourAgo = dayjs().subtract(1, 'hour')
        return commentTime.isAfter(oneHourAgo)
    }

    const handleAddAttribute = async () => {
        if (!newAttributeKey.trim()) {
            message.warning('Please enter an attribute key')
            return
        }
        setLoading(true)
        try {
            const data = await apiFetch<any>(`/api/tickets/${displayTicket.id}/attributes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meta_key: newAttributeKey.trim(), meta_value: newAttributeValue.trim() || null }),
            })
            setAttributes([...attributes, data])
            setNewAttributeKey('')
            setNewAttributeValue('')
            message.success('Attribute added')
        } catch (err: any) {
            message.error(err?.message?.includes('exists') ? 'Attribute key already exists' : err?.message || 'Failed to add attribute')
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateAttribute = async (attributeId: string, newValue: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/attributes/${attributeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meta_value: newValue.trim() || null }),
            })
            setAttributes(attributes.map((attr) => (attr.id === attributeId ? { ...attr, meta_value: newValue.trim() || null, updated_at: new Date().toISOString() } : attr)))
            setEditingAttribute(null)
            message.success('Attribute updated')
        } catch (err: any) {
            message.error(err?.message || 'Failed to update attribute')
        }
    }

    const handleDeleteAttribute = async (attributeId: string) => {
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}/attributes/${attributeId}`, { method: 'DELETE' })
            setAttributes(attributes.filter((attr) => attr.id !== attributeId))
            message.success('Attribute deleted')
        } catch (err: any) {
            message.error(err?.message || 'Failed to delete attribute')
        }
    }

    const handleUpdateDescription = async () => {
        setLoading(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: descriptionValue.trim() || null }),
            })
            setEditingDescription(false)
            message.success('Description updated successfully')
            setDisplayTicket((prev: any) => ({ ...prev, description: descriptionValue.trim() || null }))
        } catch (err: any) {
            message.error(err?.message || 'Failed to update description')
        } finally {
            setLoading(false)
        }
    }

    const handleCancelEditDescription = () => {
        setDescriptionValue(displayTicket.description || '')
        setEditingDescription(false)
    }

    const handleShortNoteChange = async (value: string | null) => {
        setShortNoteChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ short_note: value }),
            })
            message.success('Short note updated')
            setDisplayTicket((prev: any) => ({ ...prev, short_note: value }))
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update short note')
        } finally {
            setShortNoteChanging(false)
        }
    }

    const handleStatusChange = async (newStatus: string) => {
        setStatusChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            message.success('Status updated')
            setDisplayTicket((prev: any) => ({ ...prev, status: newStatus }))
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
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type_id: typeId }),
            })
            message.success('Type updated')
            setDisplayTicket((prev: any) => ({
                ...prev,
                type_id: typeId,
                type: typeId != null ? ticketTypes.find((t) => t.id === typeId) ?? null : null,
            }))
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update type')
        } finally {
            setTypeChanging(false)
        }
    }

    const handlePriorityChange = async (priorityId: number | null) => {
        setPriorityChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priority_id: priorityId }),
            })
            message.success('Priority updated')
            setDisplayTicket((prev: any) => ({
                ...prev,
                priority_id: priorityId,
                priority: priorityId != null ? ticketPriorities.find((p) => p.id === priorityId) ?? null : null,
            }))
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update priority')
        } finally {
            setPriorityChanging(false)
        }
    }

    const handleCompanyChange = async (companyId: string | null) => {
        setCompanyChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_id: companyId }),
            })
            message.success('Company updated')
            setDisplayTicket((prev: any) => ({
                ...prev,
                company_id: companyId,
                company: companyId != null ? companies.find((c) => c.id === companyId) ?? null : null,
            }))
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update company')
        } finally {
            setCompanyChanging(false)
        }
    }

    const handleDueDateChange = async (dueDate: string | null) => {
        setDueDateChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ due_date: dueDate }),
            })
            message.success('Due date updated')
            setDisplayTicket((prev: any) => ({ ...prev, due_date: dueDate }))
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update due date')
        } finally {
            setDueDateChanging(false)
        }
    }

    const handleVisibilityChange = async (visibility: string) => {
        setOptimisticVisibility(visibility)
        setVisibilityChanging(true)
        try {
            const payload: Record<string, unknown> = { visibility, assignees: [] }
            if (visibility !== 'team') payload.team_id = null
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            message.success('Visibility updated')
            router.refresh()
        } catch (err: unknown) {
            setOptimisticVisibility(null)
            message.error(err instanceof Error ? err.message : 'Failed to update visibility')
        } finally {
            setVisibilityChanging(false)
        }
    }

    const handleTeamChange = async (teamId: string | null) => {
        setTeamChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team_id: teamId,
                    visibility: teamId ? 'team' : (displayTicket.visibility === 'team' ? 'private' : displayTicket.visibility),
                    assignees: [],
                }),
            })
            message.success('Team updated')
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update team')
        } finally {
            setTeamChanging(false)
        }
    }

    const handleAssigneesChange = async (userIds: string[]) => {
        setOptimisticAssignees(userIds)
        setAssigneesChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignees: userIds,
                    visibility: userIds.length > 0 ? 'specific_users' : (displayTicket.visibility === 'specific_users' ? 'private' : displayTicket.visibility),
                    team_id: userIds.length > 0 ? null : displayTicket.team_id,
                }),
            })
            message.success('Assignees updated')
            router.refresh()
        } catch (err: unknown) {
            setOptimisticAssignees(null)
            message.error(err instanceof Error ? err.message : 'Failed to update assignees')
        } finally {
            setAssigneesChanging(false)
        }
    }

    const handleTagsChange = async (tagIds: string[]) => {
        setTagsChanging(true)
        try {
            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_ids: tagIds }),
            })
            setSelectedTagIds(tagIds)
            message.success('Tags updated')
            router.refresh()
        } catch (err: unknown) {
            message.error(err instanceof Error ? err.message : 'Failed to update tags')
        } finally {
            setTagsChanging(false)
        }
    }

  

    useEffect(() => {
        if (!displayTicket?.id) return
        const fetchDescAttachments = async () => {
            try {
                const data = await apiFetch<Array<{ id: string; file_url: string; file_name: string; file_path?: string }>>(`/api/tickets/${displayTicket.id}/attachments`)
                setDescriptionAttachmentsFromDb((data || []).map((a) => ({ ...a, file_path: a.file_path ?? '' })))
            } catch {
                setDescriptionAttachmentsFromDb([])
            }
        }
        fetchDescAttachments()
    }, [displayTicket?.id])

    const handleDescriptionFilesSelected = async (files: FileList | null) => {
        if (!files?.length || !displayTicket?.id) return
        setLoading(true)
        try {
            const companyName = displayTicket?.company?.name ?? 'unknown'
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const result = await uploadTicketFile(file, displayTicket.id, 'attachments', companyName)
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

    const handleUpdateTicket = async (values: any) => {
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

            await apiFetch(`/api/tickets/${displayTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: values.title,
                    description: values.description || null,
                    status: values.status,
                    visibility: values.visibility,
                    team_id: values.visibility === 'team' ? values.team_id || null : null,
                    type_id: values.type_id ?? null,
                    priority_id: values.priority_id ?? null,
                    company_id: variant !== 'customer' ? values.company_id ?? null : undefined,
                    due_date: values.due_date ? values.due_date.toISOString() : null,
                    assignees: values.visibility === 'specific_users' ? selectedAssignees : [],
                    tag_ids: variant !== 'customer' ? selectedTagIds : undefined,
                    attachments_add: newDescriptionAttachments.map((a) => ({ file_url: a.url, file_name: a.file_name, file_path: a.file_path })),
                    attachments_delete: deletedDescriptionAttachmentIds,
                }),
            })
            setNewDescriptionAttachments([])
            setDeletedDescriptionAttachmentIds([])
            const refreshed = await apiFetch<Array<{ id: string; file_url: string; file_name: string; file_path?: string }>>(`/api/tickets/${displayTicket.id}/attachments`)
            setDescriptionAttachmentsFromDb((refreshed || []).map((a) => ({ ...a, file_path: a.file_path ?? '' })))

            message.success('Ticket updated successfully')
            setEditModalVisible(false)

            // Reload page to get updated data
            router.refresh()
        } catch (error: any) {
            message.error(error.message || 'Failed to update ticket')
        } finally {
            setLoading(false)
        }
    }

    const completedChecklistCount = checklistItems.filter((item) => item.is_completed).length
    const totalChecklistCount = checklistItems.length
    const isCustomer = variant === 'customer'
    const isTicketAdmin = isAdmin((currentUser as { role?: string }).role)
    const rowTicketType = (displayTicket?.ticket_type as string | undefined) ?? 'support'

    const patchTicketClassification = useCallback(
        async (ticket_type: 'support' | 'spam' | 'trash') => {
            const tid = displayTicket?.id
            if (tid == null) return
            setClassifyLoading(ticket_type)
            try {
                await apiFetch(`/api/tickets/${tid}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticket_type }),
                })
                setDisplayTicket((d: typeof displayTicket) => (d ? { ...d, ticket_type } : d))
                message.success(
                    ticket_type === 'support'
                        ? 'Marked as support'
                        : ticket_type === 'spam'
                          ? 'Marked as spam'
                          : 'Marked as trash',
                )
                router.refresh()
            } catch (e: unknown) {
                message.error(e instanceof Error ? e.message : 'Failed to update classification')
            } finally {
                setClassifyLoading(null)
            }
        },
        [displayTicket?.id, router],
    )
    const timeTrackerManualUserOptions = useMemo(
        () =>
            users
                .filter((u: { role?: string }) => (u?.role ?? '').toLowerCase() !== 'customer')
                .map((u: { id: string; full_name?: string | null; email?: string | null }) => ({
                    value: String(u.id),
                    label: String(u.full_name || u.email || u.id),
                })),
        [users],
    )

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
            <AdminMainColumn collapsed={collapsed} user={currentUser}>
                <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: 'calc(100vh - 56px)' }}>
                    <Card style={{ margin: '0 auto' }}>
                        <Flex gap={16} align="center" wrap="wrap" style={{ marginBottom: 24 }}>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => router.push(isCustomer ? '/tickets' : '/tickets')}
                            >
                                Back to {isCustomer ? 'Portal' : 'Tickets'}
                            </Button>
                            <div
                                style={{
                                    flex: 1,
                                    minWidth: 240,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        flex: '1 1 200px',
                                        minWidth: 0,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <Title
                                        level={2}
                                        style={{
                                            margin: 0,
                                            flex: '1 1 160px',
                                            minWidth: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                        }}
                                    >
                                        {rowTicketType === 'spam' && (
                                            <Tooltip title="Spam">
                                                <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                                                    <WarningTwoTone
                                                        twoToneColor={['#ff4d4f', '#ffccc7']}
                                                        style={{ fontSize: 32 }}
                                                    />
                                                </span>
                                            </Tooltip>
                                        )}
                                        {rowTicketType === 'trash' && (
                                            <Tooltip title="Trash">
                                                <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                                                    <DeleteTwoTone
                                                        twoToneColor={['#ff4d4f', '#ffccc7']}
                                                        style={{ fontSize: 32 }}
                                                    />
                                                </span>
                                            </Tooltip>
                                        )}
                                        <span style={{ minWidth: 0 }}>
                                            #{displayTicket.id} {displayTicket.title}
                                        </span>
                                    </Title>
                                    {!isCustomer && (
                                        <div
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: 8,
                                            }}
                                        >
                                            {/* {rowTicketType !== 'support' && (
                                                <Tag color={rowTicketType === 'spam' ? 'red' : 'orange'}>
                                                    {rowTicketType === 'spam' ? 'Spam' : 'Trash'}
                                                </Tag>
                                            )} */}
                                            { rowTicketType !=='spam'&&(
                                                <Button
                                                icon={<WarningOutlined />}
                                                danger={rowTicketType !== 'spam'}
                                                type={rowTicketType === 'spam' ? 'primary' : 'default'}
                                                loading={classifyLoading === 'spam'}
                                                disabled={classifyLoading !== null && classifyLoading !== 'spam'}
                                                onClick={() => void patchTicketClassification('spam')}
                                            >
                                                Spam
                                            </Button>
                                            ) }
                                            
                                            { rowTicketType !=='trash'&&(
                                            <Button
                                            
                                                icon={<DeleteOutlined />}
                                                type='primary'
                                                danger
                                                loading={classifyLoading === 'trash'}
                                                disabled={classifyLoading !== null && classifyLoading !== 'trash'}
                                                onClick={() => void patchTicketClassification('trash')}
                                            >
                                                Trash
                                            </Button>
                                            ) }
                                            
                                            {rowTicketType !== 'support' && (
                                                <Button
                                                    type="primary"
                                                    loading={classifyLoading === 'support'}
                                                    disabled={
                                                        classifyLoading !== null && classifyLoading !== 'support'
                                                    }
                                                    onClick={() => void patchTicketClassification('support')}
                                                >
                                                    Mark as support
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <TicketPresenceBar
                                    ticketId={displayTicket.id}
                                    currentUser={{
                                        id: currentUser.id,
                                        name: currentUser.name,
                                        image: currentUser.image,
                                    }}
                                />
                            </div>
                        </Flex>

                            
                        <Divider />

                        {isCustomer ? (
                            <Tabs
                                defaultActiveKey="details"
                                items={[
                                    {
                                        key: 'details',
                                        label: 'Details',
                                        children: (
                                            <TabGeneralCustomer
                                                ticketData={displayTicket}
                                                ticketAttachments={descriptionAttachmentsFromDb}
                                                statusOptions={allStatusesForSelect}
                                                typeOptions={ticketTypes}
                                                priorityOptions={ticketPriorities}
                                                onTypeChange={handleTypeChange}
                                                onPriorityChange={handlePriorityChange}
                                                typeChanging={typeChanging}
                                                priorityChanging={priorityChanging}
                                                totalTimeSeconds={totalTimeSeconds}
                                                activeTimeTracker={activeTimeTracker}
                                                currentTime={currentTime}
                                                formatTime={formatTime}
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
                                                onAddComment={handleAddComment}
                                                addCommentLoading={loading}
                                                commentsHasOlder={commentsHasOlder}
                                                commentsOlderRemaining={commentsOlderRemaining}
                                                onLoadMoreComments={handleLoadMoreComments}
                                                loadMoreCommentsLoading={loadingMoreComments}
                                                companyCustomers={companyCustomers}
                                                ticketCcEmails={ticketCcEmailsState}
                                            />
                                        ),
                                    },
                                    {
                                        key: 'activity',
                                        label: 'Activity log',
                                        children: <TabActivity ticketId={displayTicket.id} />,
                                    },
                                ]}
                            />
                        ) : (
                        <Tabs
                            defaultActiveKey="general"
                            items={[
                                {
                                    key: 'general',
                                    label: 'General Info',
                                    children: (
                                        <TabGeneral
                                            ticketData={displayTicket}
                                            ticketAttachments={descriptionAttachmentsFromDb}
                                            getStatusColor={getStatusColor}
                                            getStatusLabel={getStatusLabel}
                                            statusOptions={allStatusesForSelect}
                                            onStatusChange={handleStatusChange}
                                            statusChanging={statusChanging}
                                            typeOptions={ticketTypes}
                                            onTypeChange={handleTypeChange}
                                            typeChanging={typeChanging}
                                            priorityOptions={ticketPriorities}
                                            onPriorityChange={handlePriorityChange}
                                            priorityChanging={priorityChanging}
                                            companyOptions={companies}
                                            onCompanyChange={handleCompanyChange}
                                            companyChanging={companyChanging}
                                            tagOptions={allTags}
                                            selectedTagIds={selectedTagIds}
                                            onTagsChange={handleTagsChange}
                                            tagsChanging={tagsChanging}
                                            canEditCompanyAndTags
                                            onDueDateChange={handleDueDateChange}
                                            dueDateChanging={dueDateChanging}
                                            visibilityOptions={VISIBILITY_OPTIONS}
                                            selectedVisibility={optimisticVisibility ?? displayTicket.visibility ?? 'private'}
                                            onVisibilityChange={handleVisibilityChange}
                                            visibilityChanging={visibilityChanging}
                                            teamOptions={teams}
                                            selectedTeamId={displayTicket.team_id ?? null}
                                            onTeamChange={handleTeamChange}
                                            teamChanging={teamChanging}
                                            assigneeOptions={users}
                                            selectedAssigneeIds={(optimisticAssignees ?? (displayTicket.assignees || []).map((a: any) => a.user_id || a.user?.id).filter(Boolean)).map((id: string) => String(id))}
                                            onAssigneesChange={handleAssigneesChange}
                                            assigneesChanging={assigneesChanging}
                                            canEditAssignees
                                            shortNote={displayTicket.short_note}
                                            onShortNoteChange={handleShortNoteChange}
                                            shortNoteChanging={shortNoteChanging}
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
                                            onAddComment={handleAddComment}
                                            addCommentLoading={loading}
                                            commentsHasOlder={commentsHasOlder}
                                            commentsOlderRemaining={commentsOlderRemaining}
                                            onLoadMoreComments={handleLoadMoreComments}
                                            loadMoreCommentsLoading={loadingMoreComments}
                                            ticketCcEmails={ticketCcEmailsState}
                                            commentVisibility={commentVisibility}
                                            onCommentVisibilityChange={setCommentVisibility}
                                            showNoteOption
                                            nonCustomerUsers={users.filter((u: any) => (u?.role ?? '')?.toLowerCase() !== 'customer')}
                                            companyCustomers={companyCustomers}
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
                                    key: 'time-tracker',
                                    label: 'Time Tracker',
                                    children: (
                                        <TabTimeTracker
                                            ticketData={displayTicket}
                                            totalTimeSeconds={totalTimeSeconds}
                                            activeTimeTracker={activeTimeTracker}
                                            currentTime={currentTime}
                                            formatTime={formatTime}
                                            timeTrackerSessions={timeTrackerSessions}
                                            timeTrackerLoading={loading}
                                            onStartTimeTracker={handleStartTimeTracker}
                                            onStopTimeTracker={handleStopTimeTracker}
                                            currentUserId={currentUser.id}
                                            onTimeTrackingChanged={refreshTimeTracking}
                                            canManageOthersTime={isTicketAdmin}
                                            manualUserOptions={timeTrackerManualUserOptions}
                                        />
                                    ),
                                },
                                {
                                    key: 'activity',
                                    label: 'Activity log',
                                    children: <TabActivity ticketId={displayTicket.id} />,
                                },
                                {
                                    key: 'screenshots',
                                    label: `Screenshots (${screenshots.length})`,
                                    children: <TabScreenshots screenshots={screenshots} />,
                                },
                            ]}
                        />
                        )}
                    </Card>

                   
                </Content>
            </AdminMainColumn>
        </Layout>
    )
}
