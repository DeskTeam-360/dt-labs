import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TagsContent from '@/components/content/settings/TagsContent'

export default async function TagsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <TagsContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
      }}
    />
  );
}
