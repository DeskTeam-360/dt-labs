import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CrawlSessionDetailContent from '@/components/CrawlSessionDetailContent'

export default async function CrawlSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { id } = await params

  // Fetch crawl session with related data
  const { data: crawlSession, error } = await supabase
    .from('crawl_sessions')
    .select(`
      *,
      company_websites (
        id,
        company_id,
        url,
        title,
        description,
        companies (
          id,
          name
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !crawlSession) {
    redirect('/crawl-sessions')
  }

  return <CrawlSessionDetailContent user={user} crawlSession={crawlSession} />
}

