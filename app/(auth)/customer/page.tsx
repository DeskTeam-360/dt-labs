import { auth } from '@/auth'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import CustomerDashboardContent from '@/components/CustomerDashboardContent'

function toSessionUser(u: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return { id: u.id, email: u.email ?? undefined, user_metadata: { full_name: u.name, avatar_url: u.image } }
}

export default async function CustomerPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, session.user.id!)).limit(1)
  const companyId = userRow?.companyId
  if (!companyId) redirect('/dashboard')

  return <CustomerDashboardContent user={toSessionUser(session.user)} companyId={companyId} />
}
