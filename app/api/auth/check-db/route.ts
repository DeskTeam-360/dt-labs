/**
 * GET /api/auth/check-db — verify DATABASE_URL / DB connectivity (login page only shows errors).
 */
import { NextResponse } from 'next/server'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { users } from '@/lib/db/schema'
import { sql, isNotNull } from 'drizzle-orm'

function getConnectionString() {
  const url = process.env.DATABASE_URL || ''
  const idx = url.indexOf('?')
  if (idx <= 0) return url
  const params = url.slice(idx + 1).split('&').filter((p) => !p.startsWith('schema='))
  return url.slice(0, idx) + (params.length ? '?' + params.join('&') : '')
}

export async function GET() {
  const connStr = getConnectionString()
  const host = connStr.includes('@') ? connStr.split('@')[1]?.split('/')[0] : 'unknown'

  try {
    const client = postgres(connStr, { prepare: false, max: 1 })
    const db = drizzle(client)

    // Test query: count users
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users)
    const userCount = result[0]?.count ?? 0

    // Check users that have password_hash
    const withPassword = await db
      .select({ email: users.email })
      .from(users)
      .where(isNotNull(users.passwordHash))
      .limit(5)
    const usersWithPassword = withPassword.length

    await client.end()

    return NextResponse.json({
      ok: true,
      host,
      userCount,
      usersWithPassword,
      message: userCount === 0
        ? 'The users table is empty. Run: npm run db:seed'
        : usersWithPassword === 0
          ? 'No users have password_hash set. Run the seed or update password_hash.'
          : 'DB OK',
    })
  } catch (err: unknown) {
    const e = err as Error & { code?: string; address?: string }
    let message = e?.message || String(err)
    const code = e?.code || (err as { code?: string })?.code
    const cause = e?.cause as Error | undefined
    const pg = code === '28P01' || /password authentication failed/i.test(message)

    if (pg) {
      message = 'Wrong password (database). Check the password in DATABASE_URL in .env.'
    }

    return NextResponse.json(
      {
        ok: false,
        host,
        error: message,
        code,
        detail: cause?.message,
        hint:
          pg
            ? 'If your password contains @, #, or %, URL-encode them in DATABASE_URL (e.g. %40 for @).'
            : code === 'ETIMEDOUT' || code === 'ECONNREFUSED'
              ? 'Check DATABASE_URL in .env and ensure PostgreSQL is running.'
              : code === 'ENOTFOUND'
                ? 'Host not found. Special characters in the URL password must be percent-encoded.'
                : undefined,
      },
      { status: 500 }
    )
  }
}
