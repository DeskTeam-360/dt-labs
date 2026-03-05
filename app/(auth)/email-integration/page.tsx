import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import EmailIntegrationContent from '@/components/EmailIntegrationContent'

export default async function EmailIntegrationPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: integration } = await supabase
    .from('email_integrations')
    .select('id, provider, email_address, is_active, expires_at, created_at, last_sync_at')
    .eq('provider', 'google')
    .maybeSingle()

  return (
    <EmailIntegrationContent
      user={user}
      integration={integration}
    />
  )
}
