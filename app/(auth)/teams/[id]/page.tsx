import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import TeamDetailContent from '@/components/TeamDetailContent'

export default async function TeamDetailPage({
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

  const { id } = await params

  const { data: teamData, error: teamError } = await supabase
    .from('teams')
    .select(`
      *,
      creator:users!teams_created_by_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .single()

  if (teamError || !teamData) {
    redirect('/teams')
  }

  const { data: membersData } = await supabase
    .from('team_members')
    .select(`
      id,
      team_id,
      user_id,
      role,
      joined_at,
      user:users!team_members_user_id_fkey(id, full_name, email, avatar_url)
    `)
    .eq('team_id', id)
    .order('joined_at', { ascending: true })

  const members = (membersData || []).map((m: any) => ({
    id: m.id,
    team_id: m.team_id,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    user_name: m.user?.full_name || m.user?.email || 'Unknown',
    user_email: m.user?.email || '',
    user_avatar_url: m.user?.avatar_url || null,
  }))

  const team = {
    ...teamData,
    creator_name: teamData.creator?.full_name || teamData.creator?.email || 'Unknown',
    members,
  }

  return <TeamDetailContent user={currentUser} team={team} />
}
