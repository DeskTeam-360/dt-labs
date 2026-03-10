import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TeamsContent from '@/components/TeamsContent'

function toSessionUser(u: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return { id: u.id, email: u.email ?? undefined, user_metadata: { full_name: u.name, avatar_url: u.image } }
}

export default async function TeamsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <TeamsContent user={toSessionUser(session.user)} />
}
