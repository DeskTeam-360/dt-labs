import { redirect } from 'next/navigation'

import { auth } from '@/auth'

/** The profile is the person's own user page, the same one an admin sees for anyone (My Profile), so there is only one. */
export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  redirect(`/settings/users/${session.user.id}`)
}
