import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CrawlSessionsContent from '@/components/content/crawl/CrawlSessionsContent'

export default async function CrawlSessionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <CrawlSessionsContent user={session.user} />
}

