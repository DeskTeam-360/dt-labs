import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import AiIntegrationContent from '@/components/content/settings/AiIntegrationContent'
import { getAiChatPublicConfig } from '@/lib/ai-chat-config'
import { canAccessAiSettings } from '@/lib/auth-utils'

export default async function AiSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (!canAccessAiSettings(role)) redirect('/settings')

  const config = await getAiChatPublicConfig()

  return (
    <AiIntegrationContent
      user={session.user}
      config={config}
      availableModels={[]}
    />
  )
}
