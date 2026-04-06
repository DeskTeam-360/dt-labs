import { redirect } from 'next/navigation'
import { auth } from '@/auth'

/** Auth only — list vs detail access is enforced in `page.tsx` and `[id]/page.tsx`. */
export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <>{children}</>
}
