import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import TodoDetailContent from '@/components/TodoDetailContent'

export default async function TodoDetailPage({
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

  // Await params since it's a Promise in Next.js 15+
  const { id } = await params

  // Fetch todo data with related information
  const { data: todoData, error: todoError } = await supabase
    .from('todos')
    .select(`
      *,
      creator:users!todos_created_by_fkey(id, full_name, email),
      team:teams(id, name),
      assignees:todo_assignees(
        id,
        user:users!todo_assignees_user_id_fkey(id, full_name, email)
      )
    `)
    .eq('id', id)
    .single()

  if (todoError || !todoData) {
    redirect('/todos')
  }

  // Fetch checklist items
  const { data: checklistItems } = await supabase
    .from('todo_checklist')
    .select('*')
    .eq('todo_id', id)
    .order('order_index', { ascending: true })

  // Fetch comments with user info
  const { data: comments } = await supabase
    .from('todo_comments')
    .select(`
      *,
      user:users!todo_comments_user_id_fkey(id, full_name, email)
    `)
    .eq('todo_id', id)
    .order('created_at', { ascending: true })

  // Fetch attributes
  const { data: attributes } = await supabase
    .from('todo_attributs')
    .select('*')
    .eq('todo_id', id)
    .order('meta_key', { ascending: true })

  // Fetch screenshots linked to this todo
  const { data: screenshots } = await supabase
    .from('screenshots')
    .select('*')
    .eq('todo_id', id)
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  return (
    <TodoDetailContent
      user={currentUser}
      todoData={todoData}
      checklistItems={checklistItems || []}
      comments={comments || []}
      attributes={attributes || []}
      screenshots={screenshots || []}
    />
  )
}
