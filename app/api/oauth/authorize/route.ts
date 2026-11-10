import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { allowedScopesForRole, API_SCOPES, isApiScope } from '@/lib/api-scopes'
import { canManageApiKeys } from '@/lib/auth-utils'
import { db, oauthClients, oauthCodes } from '@/lib/db'
import { CODE_MINUTES, connectionLimitMessage, randomToken, sha256Hex } from '@/lib/oauth'

/**
 * POST /api/oauth/authorize { client_id, redirect_uri, code_challenge, state?, scopes[], approve }
 * The consent page calls this once the signed-in person pressed Allow (or Deny). Returns where to send the browser next.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!canManageApiKeys(((session.user as { role?: string }).role ?? '').toLowerCase())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const b = (await request.json().catch(() => ({}))) as { client_id?: unknown; redirect_uri?: unknown; code_challenge?: unknown; state?: unknown; scopes?: unknown; approve?: unknown }
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, String(b.client_id ?? ''))).limit(1).catch(() => [])
  const redirectUri = String(b.redirect_uri ?? '')
  if (!client || !client.redirectUris.includes(redirectUri)) return NextResponse.json({ error: 'Unknown app or redirect address' }, { status: 400 })

  const target = new URL(redirectUri)
  if (b.state) target.searchParams.set('state', String(b.state))
  if (b.approve !== true) {
    target.searchParams.set('error', 'access_denied')
    return NextResponse.json({ redirect: target.toString() })
  }

  const limited = await connectionLimitMessage(session.user.id, (session.user as { role?: string }).role)
  if (limited) return NextResponse.json({ error: limited }, { status: 409 })

  const challenge = String(b.code_challenge ?? '')
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return NextResponse.json({ error: 'The app did not send a valid PKCE challenge' }, { status: 400 })
  const scopes = [...new Set((Array.isArray(b.scopes) ? b.scopes : []).filter(isApiScope))]
  if (scopes.length === 0) return NextResponse.json({ error: 'Choose at least one access' }, { status: 400 })
  // What an AI may be given depends on the person's role (agents: no workload, hours or ticket changes).
  const allowed = allowedScopesForRole((session.user as { role?: string }).role)
  const beyond = scopes.filter((s) => !allowed.includes(s))
  if (beyond.length > 0) {
    return NextResponse.json({ error: `Your role cannot give these accesses: ${beyond.map((k) => API_SCOPES.find((s) => s.key === k)?.label ?? k).join(', ')}` }, { status: 403 })
  }

  const code = randomToken('dtc_', 24)
  await db.insert(oauthCodes).values({
    codeHash: sha256Hex(code),
    clientId: client.id,
    userId: session.user.id,
    scopes,
    redirectUri,
    codeChallenge: challenge,
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60000),
  })
  target.searchParams.set('code', code)
  return NextResponse.json({ redirect: target.toString() })
}
