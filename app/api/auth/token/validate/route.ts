import { db, apiTokens } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const [tokenRow] = await db
      .select({ id: apiTokens.id, userId: apiTokens.userId, expiresAt: apiTokens.expiresAt })
      .from(apiTokens)
      .where(and(eq(apiTokens.token, token), eq(apiTokens.isActive, true)))
      .limit(1)

    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, tokenRow.id))

    return NextResponse.json({
      valid: true,
      user_id: tokenRow.userId,
    })
  } catch (error: any) {
    console.error('Failed to validate token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate token' },
      { status: 500 }
    )
  }
}
