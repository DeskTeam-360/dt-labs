/**
 * GET /api/auth/check-db - Debug koneksi database
 * Untuk development: tampilkan error dari DB/Supabase
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

    // Test query: hitung users
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users)
    const userCount = result[0]?.count ?? 0

    // Cek users dengan password_hash
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
        ? 'Tabel users kosong. Jalankan: npm run db:seed'
        : usersWithPassword === 0
          ? 'Semua user tidak punya password_hash. Jalankan seed atau update password_hash.'
          : 'DB OK',
    })
  } catch (err: unknown) {
    const e = err as Error & { code?: string; address?: string }
    const message = e?.message || String(err)
    const code = e?.code || (err as { code?: string })?.code
    const cause = e?.cause as Error | undefined

    return NextResponse.json(
      {
        ok: false,
        host,
        error: message,
        code,
        detail: cause?.message,
        hint:
          code === 'ETIMEDOUT' || code === 'ECONNREFUSED'
            ? 'Cek DATABASE_URL di .env (localhost vs Supabase). Pastikan DB berjalan.'
            : code === 'ENOTFOUND'
              ? 'Host tidak ditemukan. Password di URL mungkin salah parse (gunakan %40 untuk @, %23 untuk #)'
              : undefined,
      },
      { status: 500 }
    )
  }
}
