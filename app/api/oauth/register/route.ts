import { and, lt, notInArray, sql } from 'drizzle-orm'

import { db, oauthClients, oauthGrants } from '@/lib/db'
import { CORS_HEADERS, isAllowedRedirectUri, oauthError } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/oauth/register - dynamic client registration (RFC 7591). An MCP app such as ChatGPT registers itself here to get a client_id.
 * Public clients only: there is no secret, the sign-in is protected with PKCE and the person's own approval.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { client_name?: unknown; redirect_uris?: unknown } | null
  if (!body || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0 || body.redirect_uris.length > 5) {
    return oauthError('invalid_redirect_uri', 'Send 1 to 5 redirect_uris')
  }
  const uris = body.redirect_uris.map(String)
  if (!uris.every(isAllowedRedirectUri)) return oauthError('invalid_redirect_uri', 'Redirect URIs must be https (or http on localhost) and have no fragment')
  const name = String(body.client_name ?? 'MCP app').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120) || 'MCP app'

  // Clients nobody ever connected with are cleaned up after 30 days, so open registration does not pile up.
  await db
    .delete(oauthClients)
    .where(and(lt(oauthClients.createdAt, sql`now() - interval '30 days'`), notInArray(oauthClients.id, db.select({ id: oauthGrants.clientId }).from(oauthGrants))))
  const [row] = await db.insert(oauthClients).values({ name, redirectUris: uris }).returning({ id: oauthClients.id })

  return Response.json(
    {
      client_id: row.id,
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201, headers: { 'Cache-Control': 'no-store', ...CORS_HEADERS } }
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
