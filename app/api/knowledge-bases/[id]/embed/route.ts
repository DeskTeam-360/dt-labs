import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
const EMBEDDING_DIMENSION = 1536

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { id } = await params

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

    const { data: row, error: fetchError } = await supabase
      .from('company_knowledge_bases')
      .select('id, content')
      .eq('id', id)
      .single()

    if (fetchError || !row) {
      return NextResponse.json({ error: 'Knowledge base entry not found' }, { status: 404 })
    }

    const text = row.content ? stripHtml(row.content) : ''
    if (!text) {
      return NextResponse.json(
        { error: 'No content to embed' },
        { status: 400 }
      )
    }

    const openaiRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: text,
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.error?.message || 'OpenAI embedding failed' },
        { status: openaiRes.status }
      )
    }

    const resJson = await openaiRes.json()
    const embedding = resJson?.data?.[0]?.embedding as number[] | undefined
    const totalTokens = resJson?.usage?.total_tokens ?? 0
    if (!embedding || !Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
      return NextResponse.json(
        {
          error: 'Invalid embedding response',
          detail: embedding ? `length ${embedding.length}, expected ${EMBEDDING_DIMENSION}` : 'no embedding in response',
        },
        { status: 502 }
      )
    }

    const { error: updateError } = await supabase
      .from('company_knowledge_bases')
      .update({ embedding })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to save embedding' },
        { status: 500 }
      )
    }

    await supabase.from('ai_token_usage').insert({
      user_id: user.id,
      used_for: 'knowledge_base_embed',
      ai_model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      content_text: null,
      prompt_tokens: totalTokens,
      completion_tokens: 0,
      total_tokens: totalTokens,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to generate embedding' },
      { status: 500 }
    )
  }
}
