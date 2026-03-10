import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import UsersContent from '@/components/UsersContent'

export default async function UsersPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <UsersContent user={session.user} />
}



