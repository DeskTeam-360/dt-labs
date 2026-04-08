import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ContentPlannerDetailContent from '@/components/ContentPlannerDetailContent'
import {
  db,
  companies,
  companyContentPlanners,
  contentPlannerChannels,
  contentPlannerTopicTypes,
  contentPlannerIntents,
  companyAiSystemTemplate,
} from '@/lib/db'
import { eq, and, asc } from 'drizzle-orm'

function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
    out[snake] = v
  }
  return out
}

export default async function SettingsContentPlannerDetailPage({
  params,
}: {
  params: Promise<{ id: string; plannerId: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const { id: companyId, plannerId } = await params

  const [companyRow] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!companyRow) {
    redirect('/settings/companies')
  }

  const companyData = { id: companyRow.id, name: companyRow.name }

  const [plannerRow] = await db
    .select({
      planner: companyContentPlanners,
      channelId: contentPlannerChannels.id,
      channelTitle: contentPlannerChannels.title,
      channelTemplateId: contentPlannerChannels.companyAiSystemTemplateId,
      topicTypeId: contentPlannerTopicTypes.id,
      topicTypeTitle: contentPlannerTopicTypes.title,
    })
    .from(companyContentPlanners)
    .leftJoin(contentPlannerChannels, eq(companyContentPlanners.channelId, contentPlannerChannels.id))
    .leftJoin(contentPlannerTopicTypes, eq(companyContentPlanners.topicTypeId, contentPlannerTopicTypes.id))
    .where(and(eq(companyContentPlanners.id, plannerId), eq(companyContentPlanners.companyId, companyId)))
    .limit(1)

  if (!plannerRow?.planner) {
    redirect(`/settings/companies/${companyId}`)
  }

  const p = plannerRow.planner
  const plannerData = {
    ...toSnake(p as unknown as Record<string, unknown>),
    channel: plannerRow.channelId
      ? { id: plannerRow.channelId, title: plannerRow.channelTitle, company_ai_system_template_id: plannerRow.channelTemplateId }
      : null,
    topic_type: plannerRow.topicTypeId
      ? { id: plannerRow.topicTypeId, title: plannerRow.topicTypeTitle }
      : null,
  }

  const [intentsRows, topicTypesRows, channelsRows, aiTemplatesRows] = await Promise.all([
    db.select({ id: contentPlannerIntents.id, title: contentPlannerIntents.title }).from(contentPlannerIntents).orderBy(asc(contentPlannerIntents.title)),
    db.select({ id: contentPlannerTopicTypes.id, title: contentPlannerTopicTypes.title }).from(contentPlannerTopicTypes).orderBy(asc(contentPlannerTopicTypes.title)),
    db.select({ id: contentPlannerChannels.id, title: contentPlannerChannels.title }).from(contentPlannerChannels).orderBy(asc(contentPlannerChannels.title)),
    db.select({ id: companyAiSystemTemplate.id, title: companyAiSystemTemplate.title }).from(companyAiSystemTemplate).orderBy(asc(companyAiSystemTemplate.title)),
  ])

  const intents = intentsRows
  const topicTypes = topicTypesRows
  const channels = channelsRows
  const aiSystemTemplates = aiTemplatesRows

  return (
    <ContentPlannerDetailContent
      user={session.user as { id: string; email?: string; name?: string; role?: string }}
      companyData={companyData}
      plannerData={plannerData}
      intents={intents}
      topicTypes={topicTypes}
      channels={channels}
      aiSystemTemplates={aiSystemTemplates}
    />
  )
}
