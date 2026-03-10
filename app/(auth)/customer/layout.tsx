import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const [userRow] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, session.user.id!))
    .limit(1)

  if (!userRow?.companyId) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
