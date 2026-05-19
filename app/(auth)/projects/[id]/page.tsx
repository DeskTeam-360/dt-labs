import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ProjectDetailContent from '@/components/content/project/ProjectDetailContent'
import { canAccessProjects } from '@/lib/auth-utils'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessProjects((session.user as { role?: string }).role)) {
    redirect('/dashboard')
  }
  const { id } = await params
  return <ProjectDetailContent user={session.user} projectId={id} />
}
