import { auth } from '@/auth'
import ChangePasswordContent from '@/components/content/ChangePasswordContent'

export default async function ChangePasswordPage() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  return (
    <ChangePasswordContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
      }}
    />
  )
}



