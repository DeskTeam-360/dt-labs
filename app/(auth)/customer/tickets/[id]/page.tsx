import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import TodoDetailContent from '@/components/TodoDetailContent'

export default async function CustomerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) {
    redirect('/login')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', currentUser.id)
    .single()

  const companyId = userData?.company_id
  if (!companyId) {
    redirect('/dashboard')
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    redirect('/customer')
  }

  const { data: todoData, error: todoError } = await supabase
    .from('tickets')
    .select(`
      *,
      creator:users!todos_created_by_fkey(id, full_name, email),
      team:teams(id, name),
      type:ticket_types(id, title, slug, color),
      company:companies(id, name, color),
      assignees:todo_assignees(
        id,
        user:users!todo_assignees_user_id_fkey(id, full_name, email, avatar_url)
      )
    `)
    .eq('id', ticketId)
    .eq('company_id', companyId)
    .single()

  if (todoError || !todoData) {
    redirect('/customer')
  }

  const { data: checklistItems } = await supabase
    .from('todo_checklist')
    .select('*')
    .eq('todo_id', ticketId)
    .order('order_index', { ascending: true })

  const { data: comments } = await supabase
    .from('todo_comments')
    .select(`
      *,
      user:users!todo_comments_user_id_fkey(id, full_name, email, avatar_url),
      comment_attachments(id, file_url, file_name)
    `)
    .eq('todo_id', ticketId)
    .eq('visibility', 'reply')
    .order('created_at', { ascending: true })

  const { data: attributes } = await supabase
    .from('todo_attributs')
    .select('*')
    .eq('todo_id', ticketId)
    .order('meta_key', { ascending: true })

  const { data: screenshots } = await supabase
    .from('screenshots')
    .select('*')
    .eq('todo_id', ticketId)
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  const { data: ticketTags } = await supabase
    .from('ticket_tags')
    .select('tag_id, tags(id, name, slug, color)')
    .eq('ticket_id', ticketId)

  const tags = (ticketTags || [])
    .map((row: any) => row.tags)
    .filter(Boolean)

  return (
    <TodoDetailContent
      user={currentUser}
      todoData={todoData}
      checklistItems={checklistItems || []}
      comments={comments || []}
      attributes={attributes || []}
      screenshots={screenshots || []}
      tags={tags}
      variant="customer"
    />
  )
}
