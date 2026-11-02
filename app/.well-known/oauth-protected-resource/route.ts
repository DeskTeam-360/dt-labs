import { CORS_HEADERS, siteOrigin } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

/** RFC 9728: tells an MCP client which server signs people in for /api/mcp. */
export async function GET(request: Request) {
  const origin = siteOrigin(request)
  return Response.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'] }, { headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
