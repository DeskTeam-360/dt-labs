import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import DashboardContent from '@/components/DashboardContent'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null // Layout akan handle redirect
  }

  // Fetch statistics
  const [usersResult, teamsResult, completedTodosResult, totalTodosResult] = await Promise.all([
    // Total Users
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true }),
    
    // Total Teams
    supabase
      .from('teams')
      .select('*', { count: 'exact', head: true }),
    
    // Total Completed Tickets
    supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed'),
    
    // Total Tickets
    supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true }),
  ])

  const usersCount = usersResult.count || 0
  const teamsCount = teamsResult.count || 0
  const completedTodosCount = completedTodosResult.count || 0
  const totalTodosCount = totalTodosResult.count || 0

  return (
    <DashboardContent
      user={user}
      stats={{
        totalUsers: usersCount,
        totalTeams: teamsCount,
        completedTodos: completedTodosCount,
        totalTodos: totalTodosCount,
      }}
    />
  )
}

