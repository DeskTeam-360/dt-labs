import { db, projectStatuses } from '@/lib/db'

/** Default Kanban columns for a new (or migrated) project. */
export async function seedDefaultProjectStatuses(projectId: string) {
  await db.insert(projectStatuses).values([
    { projectId, title: 'Backlog', slug: 'backlog', color: '#F1C232', sortOrder: 0 },
    { projectId, title: 'In progress', slug: 'in_progress', color: '#64BCE9', sortOrder: 1 },
    { projectId, title: 'Done', slug: 'done', color: '#52c41a', sortOrder: 2 },
  ])
}
