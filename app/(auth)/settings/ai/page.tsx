import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import AiIntegrationContent from '@/components/content/settings/AiIntegrationContent'
import { getAiChatPublicConfig } from '@/lib/ai-chat-config'
import { canAccessAiSettings } from '@/lib/auth-utils'

async function fetchCodexModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/models`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as { data?: Array<{ id?: string }> }
    return data.data?.map((item) => item.id).filter((id): id is string => !!id) ?? []
  } catch {
    return []
  }
}

export default async function AiSettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role
  if (!canAccessAiSettings(role)) {
    redirect('/settings')
  }

  const config = getAiChatPublicConfig()
  const availableModels =
    config.configured && config.provider === 'codex'
      ? await fetchCodexModels(config.baseUrl)
      : []

  return (
    <AiIntegrationContent
      user={session.user}
      config={config}
      availableModels={availableModels}
    />
  )
}
