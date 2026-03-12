import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CrawlSessionsContent from '@/components/CrawlSessionsContent'

export default async function CrawlSessionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <CrawlSessionsContent user={session.user} />
}

