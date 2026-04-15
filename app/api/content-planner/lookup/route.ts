import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  companyAiSystemTemplate,
  contentPlannerChannels,
  contentPlannerIntents,
  contentPlannerTopicTypes,
} from '@/lib/db/schema'

/** GET /api/content-planner/lookup - Lookup data for content planner */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [intents, topicTypes, channels, templates] = await Promise.all([
    db.select({ id: contentPlannerIntents.id, title: contentPlannerIntents.title }).from(contentPlannerIntents).orderBy(asc(contentPlannerIntents.title)),
    db.select({ id: contentPlannerTopicTypes.id, title: contentPlannerTopicTypes.title }).from(contentPlannerTopicTypes).orderBy(asc(contentPlannerTopicTypes.title)),
    db.select({ id: contentPlannerChannels.id, title: contentPlannerChannels.title, company_ai_system_template_id: contentPlannerChannels.companyAiSystemTemplateId }).from(contentPlannerChannels).orderBy(asc(contentPlannerChannels.title)),
    db.select({ id: companyAiSystemTemplate.id, title: companyAiSystemTemplate.title }).from(companyAiSystemTemplate).orderBy(asc(companyAiSystemTemplate.title)),
  ])

  return NextResponse.json({
    intents,
    topicTypes,
    channels,
    aiTemplates: templates,
  })
}
