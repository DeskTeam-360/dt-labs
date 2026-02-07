import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
const EMBEDDING_DIMENSION = 1536
const DEFAULT_MATCH_COUNT = 5

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000)
}

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

    const body = await request.json().catch(() => ({}))
    const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : null
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''

    const { data: planner, error: plannerError } = await supabase
      .from('company_content_planners')
      .select(`
        id,
        company_id,
        topic,
        primary_keyword,
        secondary_keywords,
        intents,
        location,
        cta_dynamic,
        cta_type,
        cta_text,
        channel:content_planner_channels(id, title),
        format:content_planner_formats(id, title)
      `)
      .eq('id', plannerId)
      .eq('company_id', companyId)
      .single()

    if (plannerError || !planner) {
      return NextResponse.json({ error: 'Content planner not found' }, { status: 404 })
    }

    const plannerAny = planner as any
    const channelTitle = plannerAny?.channel?.title ?? ''
    const formatTitle = plannerAny?.format?.title ?? ''
    let intentTitles = ''
    if (Array.isArray(plannerAny?.intents) && plannerAny.intents.length > 0) {
      const { data: intentRows } = await supabase
        .from('content_planner_intents')
        .select('id, title')
        .in('id', plannerAny.intents)
      intentTitles = (intentRows || []).map((r: { title: string }) => r.title).join(', ')
    }

    let extraInstructions = ''
    if (templateId) {
      const { data: templateRow } = await supabase
        .from('company_ai_system_template')
        .select('title, content')
        .eq('id', templateId)
        .single()
      if (templateRow?.content) {
        extraInstructions = `\n\nAdditional instructions from AI template "${(templateRow as any).title ?? ''}":\n${(templateRow as any).content}`
      }
    }

    const queryForEmbed = prompt || `${plannerAny?.topic ?? ''} ${plannerAny?.primary_keyword ?? ''} ${channelTitle} ${formatTitle}`.trim() || 'brand voice USP positioning'

    let embedTokens = 0

    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: queryForEmbed,
      }),
    })

    if (!embedRes.ok) {
      const err = await embedRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.error?.message || 'OpenAI embedding failed' },
        { status: embedRes.status }
      )
    }

    const embedJson = await embedRes.json()
    embedTokens = embedJson?.usage?.total_tokens ?? 0
    const queryEmbedding = embedJson?.data?.[0]?.embedding as number[] | undefined
    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== EMBEDDING_DIMENSION) {
      return NextResponse.json({ error: 'Invalid embedding response' }, { status: 502 })
    }

    const { data: matches, error: rpcError } = await supabase.rpc('search_company_knowledge_bases', {
      p_company_id: companyId,
      p_query_embedding: queryEmbedding,
      p_match_count: DEFAULT_MATCH_COUNT,
    })

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message || 'Knowledge base search failed' },
        { status: 500 }
      )
    }

    const contextParts = (matches || [])
      .filter((m: { content?: string | null }) => m?.content)
      .map((m: { content: string }) => stripHtml(m.content))
    const brandKnowledge = contextParts.length > 0
      ? contextParts.join('\n\n---\n\n')
      : 'No brand references in knowledge base. Use a friendly, professional tone.'

    const ctaType = plannerAny?.cta_dynamic ? 'Dynamic (determine based on intent and channel)' : (plannerAny?.cta_type ?? '')
    const ctaText = plannerAny?.cta_dynamic ? 'Dynamic (determine based on intent and channel)' : (plannerAny?.cta_text ?? '')

    const contentTemplate = `Generate content using the following structured data.

Brand knowledge:
- Retrieve brand voice, USP, and positioning from vector DB using vector_reference_id.
- Here is the brand knowledge from the knowledge base:
${brandKnowledge}

Content metadata:
- Content ID: ${plannerId}
- Channel: ${channelTitle || 'Not specified'}
- Format: ${formatTitle || 'Not specified'}
- Topic: ${plannerAny?.topic ?? ''}
- Primary keyword: ${plannerAny?.primary_keyword ?? ''}
- Secondary keywords: ${plannerAny?.secondary_keywords ?? ''}
- Search intent: ${intentTitles || 'Not specified'}
- Target location: ${plannerAny?.location ?? ''}

CTA rules:
- CTA type: ${ctaType}
- CTA text: ${ctaText}
- CTA must appear once at the end.
- CTA must match the intent and channel.

Writing rules:
- Write specifically for ${channelTitle || 'the channel'} and ${formatTitle || 'the format'}.
- Focus on ${intentTitles || 'the intended'} intent.
- Keep content concise, clear, and locally relevant.
- Use friendly and professional tone.
- Do NOT use bullet points unless format requires it.
- Avoid repetition of keywords.
- Avoid emojis unless allowed by channel.

Output requirements:
- Return only the final content.
- No explanations.
- No headings unless format requires it.${extraInstructions}`

    const systemMessage = contentTemplate
    const userMessage = prompt || 'Generate the content based on the instructions above.'

    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
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

    const contentText = rawContent || ''
    const aiContentResults = {
      ai_model: OPENAI_CHAT_MODEL,
      ai_version: null as string | null,
      generated_date: new Date().toISOString(),
      content_text: contentText,
      prompt_id: templateId || null,
      vector_reference_id: null as string | null,
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

    const totalTokens = embedTokens + totalChatTokens
    await supabase.from('ai_token_usage').insert({
      user_id: user.id,
      used_for: 'content_planner_generate',
      ai_model: OPENAI_CHAT_MODEL,
      ai_version: null,
      content_text: contentText,
      prompt_id: templateId || null,
      prompt_tokens: promptTokens + embedTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      company_id: companyId,
      company_content_planner_id: plannerId,
    })

    return NextResponse.json({ result: { content: contentText }, aiContentResults })
  } catch (error: unknown) {
    const err = error as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to generate content' },
      { status: 500 }
    )
  }
}
