import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; plannerId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { id: companyId, plannerId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 503 }
      )
    }

    const { data: planner, error: plannerError } = await supabase
      .from('company_content_planners')
      .select(`
        id,
        company_id,
        topic,
        topic_description,
        topic_type_id,
        hashtags,
        primary_keyword,
        secondary_keywords,
        intents,
        location,
        cta_dynamic,
        cta_type,
        cta_text,
        insight,
        channel:content_planner_channels(id, title, company_ai_system_template_id),
        topic_type:content_planner_topic_types(id, title)
      `)
      .eq('id', plannerId)
      .eq('company_id', companyId)
      .single()

    if (plannerError || !planner) {
      return NextResponse.json({ error: 'Content planner not found' }, { status: 404 })
    }

    const plannerAny = planner as any
    const channelTitle = plannerAny?.channel?.title ?? ''
    const topicTypeTitle = plannerAny?.topic_type?.title ?? ''
    const defaultTemplateId = plannerAny?.channel?.company_ai_system_template_id ?? null

    if (!defaultTemplateId) {
      return NextResponse.json(
        {
          error: `Channel "${channelTitle || 'Unknown'}" has no default AI template. Set a default template for this channel to generate content.`,
        },
        { status: 400 }
      )
    }

    const { data: templateRow, error: templateError } = await supabase
      .from('company_ai_system_template')
      .select('id, title, content, format')
      .eq('id', defaultTemplateId)
      .single()

    if (templateError || !templateRow?.content) {
      return NextResponse.json(
        { error: 'Default AI template for this channel not found or has no content.' },
        { status: 400 }
      )
    }

    let intentTitles = ''
    if (Array.isArray(plannerAny?.intents) && plannerAny.intents.length > 0) {
      const { data: intentRows } = await supabase
        .from('content_planner_intents')
        .select('id, title')
        .in('id', plannerAny.intents)
      intentTitles = (intentRows || []).map((r: { title: string }) => r.title).join(', ')
    }

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

    const { error: updateError } = await supabase
      .from('company_content_planners')
      .update({
        ai_content_results: aiContentResults,
        status: 'ai_generated',
      })
      .eq('id', plannerId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save AI content' }, { status: 500 })
    }

    const totalTokens = totalChatTokens
    await supabase.from('ai_token_usage').insert({
      user_id: user.id,
      used_for: 'content_planner_generate',
      ai_model: OPENAI_CHAT_MODEL,
      ai_version: null,
      content_text: contentText,
      prompt_id: defaultTemplateId,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      company_id: companyId,
      company_content_planner_id: plannerId,
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
