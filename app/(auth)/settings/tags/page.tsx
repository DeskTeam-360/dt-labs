import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TagsContent from '@/components/content/TagsContent'

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
