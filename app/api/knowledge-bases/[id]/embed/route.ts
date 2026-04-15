import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  aiTokenUsage,
  companyKnowledgeBases,
} from '@/lib/db/schema'

const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
const EMBEDDING_DIMENSION = 1536

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 503 }
      )
    }

    const [row] = await db
      .select({ id: companyKnowledgeBases.id, content: companyKnowledgeBases.content })
      .from(companyKnowledgeBases)
      .where(eq(companyKnowledgeBases.id, id))
      .limit(1)

    if (!row) {
      return NextResponse.json(
        { error: 'Knowledge base entry not found' },
        { status: 404 }
      )
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
    if (
      !embedding ||
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIMENSION
    ) {
      return NextResponse.json(
        {
          error: 'Invalid embedding response',
          detail: embedding
            ? `length ${embedding.length}, expected ${EMBEDDING_DIMENSION}`
            : 'no embedding in response',
        },
        { status: 502 }
      )
    }

    await db
      .update(companyKnowledgeBases)
      .set({ embedding: embedding as unknown })
      .where(eq(companyKnowledgeBases.id, id))

    await db.insert(aiTokenUsage).values({
      userId: session.user.id,
      usedFor: 'knowledge_base_embed',
      aiModel: OPENAI_EMBEDDING_MODEL,
      promptTokens: totalTokens,
      completionTokens: 0,
      totalTokens: totalTokens,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to generate embedding' },
      { status: 500 }
    )
  }
}
