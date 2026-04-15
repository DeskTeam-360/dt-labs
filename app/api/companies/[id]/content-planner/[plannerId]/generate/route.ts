import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import {
  aiTokenUsage,
  companyAiSystemTemplate,
  companyContentPlanners,
  contentPlannerChannels,
  contentPlannerIntents,
  contentPlannerTopicTypes,
  db,
} from '@/lib/db'

const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; plannerId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id!

    const { id: companyId, plannerId } = await params

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 503 }
      )
    }

    const [plannerRow] = await db
      .select({
        planner: companyContentPlanners,
        channelId: contentPlannerChannels.id,
        channelTitle: contentPlannerChannels.title,
        channelTemplateId: contentPlannerChannels.companyAiSystemTemplateId,
        topicTypeTitle: contentPlannerTopicTypes.title,
      })
      .from(companyContentPlanners)
      .leftJoin(contentPlannerChannels, eq(companyContentPlanners.channelId, contentPlannerChannels.id))
      .leftJoin(contentPlannerTopicTypes, eq(companyContentPlanners.topicTypeId, contentPlannerTopicTypes.id))
      .where(and(eq(companyContentPlanners.id, plannerId), eq(companyContentPlanners.companyId, companyId)))
      .limit(1)

    if (!plannerRow?.planner) {
      return NextResponse.json({ error: 'Content planner not found' }, { status: 404 })
    }

    const p = plannerRow.planner
    const channelTitle = plannerRow.channelTitle ?? ''
    const topicTypeTitle = plannerRow.topicTypeTitle ?? ''
    const defaultTemplateId = plannerRow.channelTemplateId ?? null

    if (!defaultTemplateId) {
      return NextResponse.json(
        {
          error: `Channel "${channelTitle || 'Unknown'}" has no default AI template. Set a default template for this channel to generate content.`,
        },
        { status: 400 }
      )
    }

    const [templateRow] = await db
      .select({ id: companyAiSystemTemplate.id, title: companyAiSystemTemplate.title, content: companyAiSystemTemplate.content, format: companyAiSystemTemplate.format })
      .from(companyAiSystemTemplate)
      .where(eq(companyAiSystemTemplate.id, defaultTemplateId))
      .limit(1)

    if (!templateRow?.content) {
      return NextResponse.json(
        { error: 'Default AI template for this channel not found or has no content.' },
        { status: 400 }
      )
    }

    let intentTitles = ''
    const intentsArr = p.intents
    if (Array.isArray(intentsArr) && intentsArr.length > 0) {
      const intentRows = await db
        .select({ title: contentPlannerIntents.title })
        .from(contentPlannerIntents)
        .where(inArray(contentPlannerIntents.id, intentsArr))
      intentTitles = intentRows.map((r) => r.title).join(', ')
    }

    const plannerAny = {
      ...p,
      channel: { title: channelTitle, company_ai_system_template_id: defaultTemplateId },
      topic_type: { title: topicTypeTitle },
      cta_dynamic: p.ctaDynamic,
      cta_type: p.ctaType,
      cta_text: p.ctaText,
      topic_description: p.topicDescription,
      primary_keyword: p.primaryKeyword,
      secondary_keywords: p.secondaryKeywords,
      intents: intentsArr,
    } as any

    const ctaTypeDisplay = plannerAny?.cta_dynamic
      ? 'Dynamic (determine based on intent and channel)'
      : (plannerAny?.cta_type ?? '')
    const ctaTextDisplay = plannerAny?.cta_dynamic
      ? 'Dynamic (determine based on intent and channel)'
      : (plannerAny?.cta_text ?? '')

    const placeholders: Record<string, string> = {
      topic: plannerAny?.topic ?? '',
      topic_description: plannerAny?.topic_description ?? '',
      hashtags: plannerAny?.hashtags ?? '',
      primary_keyword: plannerAny?.primary_keyword ?? '',
      secondary_keywords: plannerAny?.secondary_keywords ?? '',
      channel: channelTitle,
      topic_type: topicTypeTitle,
      intents: intentTitles,
      location: plannerAny?.location ?? '',
      cta_type: ctaTypeDisplay,
      cta_text: ctaTextDisplay,
      insight: plannerAny?.insight ?? '',
    }

    let promptFromTemplate = (templateRow as any).content
    for (const [key, value] of Object.entries(placeholders)) {
      promptFromTemplate = promptFromTemplate.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'gi'),
        value
      )
    }

    const templateFormat = (templateRow as any).format?.trim()?.toLowerCase() ?? ''
    const outputAsJson = templateFormat === 'json' || templateFormat === 'application/json'

    let systemMessage = promptFromTemplate
    if (templateFormat) {
      systemMessage += `\n\nOutput format json with data: ${(templateRow as any).format} `
    }

    const userMessage = 'Generate the content based on the instructions above.'

    const chatBody: Record<string, unknown> = {
      model: OPENAI_CHAT_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }
    if (outputAsJson) {
      chatBody.response_format = { type: 'json_object' }
    }

    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(chatBody),
    })

    if (!chatRes.ok) {
      const err = await chatRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.error?.message || 'OpenAI chat failed' },
        { status: chatRes.status }
      )
    }

    const chatJson = await chatRes.json()
    const rawContent = chatJson?.choices?.[0]?.message?.content?.trim() ?? ''
    const usage = chatJson?.usage ?? {}
    const promptTokens = usage.prompt_tokens ?? 0
    const completionTokens = usage.completion_tokens ?? 0
    const totalChatTokens = usage.total_tokens ?? promptTokens + completionTokens

    function extractJsonString(s: string): string {
      const t = s.trim()
      const fence = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m)
      if (fence?.[1]) return fence[1].trim()
      const noFence = t.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/m, '').trim()
      if (noFence.startsWith('{')) return noFence
      const firstBrace = noFence.indexOf('{')
      if (firstBrace >= 0) {
        let depth = 0
        let end = -1
        for (let i = firstBrace; i < noFence.length; i++) {
          if (noFence[i] === '{') depth++
          else if (noFence[i] === '}') {
            depth--
            if (depth === 0) {
              end = i
              break
            }
          }
        }
        if (end >= firstBrace) return noFence.slice(firstBrace, end + 1)
      }
      return t
    }

    let contentText = rawContent || ''
    let outputJson: Record<string, unknown> | null = null
    const toParse = extractJsonString(rawContent || '')
    if (toParse.startsWith('{')) {
      try {
        const parsed = JSON.parse(toParse) as Record<string, unknown>
        if (parsed && typeof parsed === 'object') {
          outputJson = parsed
          const displayContent =
            (parsed.content as string) ??
            (parsed.text as string) ??
            (parsed.body as string)
          contentText = typeof displayContent === 'string' ? displayContent : ''
        }
      } catch {
        contentText = rawContent || ''
      }
    }

    const aiContentResults: Record<string, unknown> = {
      ai_model: OPENAI_CHAT_MODEL,
      ai_version: null as string | null,
      generated_date: new Date().toISOString(),
      prompt_id: defaultTemplateId,
    }
    if (outputJson != null) {
      aiContentResults.output_json = outputJson
      aiContentResults.content_text = contentText
    } else {
      aiContentResults.content_text = contentText
    }

    await db
      .update(companyContentPlanners)
      .set({
        aiContentResults: aiContentResults,
        status: 'ai_generated',
      })
      .where(eq(companyContentPlanners.id, plannerId))

    await db.insert(aiTokenUsage).values({
      userId,
      usedFor: 'content_planner_generate',
      aiModel: OPENAI_CHAT_MODEL,
      contentText,
      promptId: defaultTemplateId,
      promptTokens,
      completionTokens,
      totalTokens: totalChatTokens,
      companyId,
      companyContentPlannerId: plannerId,
    })

    const result: { content: string; output_json?: Record<string, unknown> } = {
      content: contentText,
    }
    if (outputJson != null) {
      result.output_json = outputJson
    }
    return NextResponse.json({ result, aiContentResults })
  } catch (error: unknown) {
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to generate content' },
      { status: 500 }
    )
  }
}
