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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { id: companyId } = await params

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
    const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : ''
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
    if (!templateId) {
      return NextResponse.json(
        { error: 'Missing template_id (select AI System Template)' },
        { status: 400 }
      )
    }

    // Load AI system template (system prompt)
    const { data: templateRow, error: templateError } = await supabase
      .from('company_ai_system_template')
      .select('id, title, content')
      .eq('id', templateId)
      .single()

    if (templateError || !templateRow) {
      return NextResponse.json(
        { error: 'AI system template not found' },
        { status: 404 }
      )
    }

    const templateContent = templateRow.content ?? ''
    const queryForEmbed = prompt || `${templateRow.title ?? ''} ${templateContent.slice(0, 800)}`.trim() || 'generate'

    // 1) Embed query for KB search
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
        {
          error: err?.error?.message || 'OpenAI embedding failed',
          detail: err?.error ?? err,
          status: embedRes.status,
        },
        { status: embedRes.status }
      )
    }

    const embedJson = await embedRes.json()
    const queryEmbedding = embedJson?.data?.[0]?.embedding as number[] | undefined
    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length !== EMBEDDING_DIMENSION) {
      return NextResponse.json(
        { error: 'Invalid embedding response' },
        { status: 502 }
      )
    }

    // 2) Search company knowledge base by similarity
    const { data: matches, error: rpcError } = await supabase.rpc('search_company_knowledge_bases', {
      p_company_id: companyId,
      p_query_embedding: queryEmbedding,
      p_match_count: DEFAULT_MATCH_COUNT,
    })

    if (rpcError) {
      return NextResponse.json(
        {
          error: rpcError.message || 'Knowledge base search failed',
          detail: rpcError.details ?? rpcError.hint ?? null,
          code: rpcError.code ?? null,
        },
        { status: 500 }
      )
    }

    const contextParts = (matches || [])
      .filter((m: { content?: string | null }) => m?.content)
      .map((m: { content: string }) => stripHtml(m.content))
    const context = contextParts.length > 0
      ? contextParts.join('\n\n---\n\n')
      : 'No references from knowledge base for this company. Use general knowledge and the requested format.'

    const systemMessage = `${templateContent}\n\nKnowledge base context:\n${context}`
    const userMessage = prompt || 'Generate based on the context above.'

    // 3) Generate content with OpenAI Chat (system prompt from template)
    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        response_format: { type: 'json_object' },
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
        {
          error: err?.error?.message || 'OpenAI chat failed',
          detail: err?.error ?? err,
          status: chatRes.status,
        },
        { status: chatRes.status }
      )
    }

    const chatJson = await chatRes.json()
    const rawContent = chatJson?.choices?.[0]?.message?.content?.trim() ?? ''

    let result: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(rawContent)
      result = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { content: rawContent }
    } catch {
      result = { content: rawContent }
    }

    // 4) Save to history (store full JSON string)
    const contentForHistory = JSON.stringify(result)
    const promptForHistory = prompt ? prompt : `Template: ${templateRow.title ?? templateId}`
    let historyError: string | null = null
    const { error: insertError } = await supabase
      .from('company_content_generation_history')
      .insert({
        company_id: companyId,
        prompt: promptForHistory,
        content: contentForHistory,
        created_by: user.id,
      })

    if (insertError) {
      historyError = insertError.message || String(insertError)
      console.error('Failed to save generation history:', insertError)
    }

    return NextResponse.json({ result, historyError })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Failed to generate content',
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    )
  }
}
