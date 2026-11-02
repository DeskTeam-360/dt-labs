import { ALL_SCOPE_KEYS, CORS_HEADERS, siteOrigin } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

/** RFC 8414: where to register, sign in and get tokens. Public clients with PKCE (S256) only. */
export async function GET(request: Request) {
  const origin = siteOrigin(request)
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ALL_SCOPE_KEYS,
    },
    { headers: CORS_HEADERS }
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
