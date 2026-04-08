import { auth } from '@/auth'
import SlackNotificationRulesContent from '@/components/SlackNotificationRulesContent'

export default async function SlackNotificationsPage() {
  const session = await auth()
  if (!session?.user) return null
  return <SlackNotificationRulesContent user={session.user} />
}
