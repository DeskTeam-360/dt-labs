import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ProjectsContent from '@/components/content/project/ProjectsContent'
import { canAccessProjects } from '@/lib/auth-utils'

export default async function ProjectsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessProjects((session.user as { role?: string }).role)) {
    redirect('/dashboard')
  }
  return <ProjectsContent user={session.user} />
}
