import { NextResponse } from 'next/server'

import { GET as calendarEventsGet } from '@/app/api/calendar/events/route'
import { GET as calendarStatusGet } from '@/app/api/calendar/user-status/route'
import { GET as catalogGet } from '@/app/api/v1/catalog/route'
import { GET as companiesGet } from '@/app/api/v1/companies/route'
import { GET as teamLoadGet } from '@/app/api/v1/team-load/route'
import { GET as suggestGet } from '@/app/api/v1/team-load/suggest/route'
import { GET as activityGet } from '@/app/api/v1/tickets/[id]/activity/route'
import { POST as notePost } from '@/app/api/v1/tickets/[id]/notes/route'
import { GET as ticketGet, PATCH as ticketPatch } from '@/app/api/v1/tickets/[id]/route'
import { GET as ticketsGet, POST as ticketsPost } from '@/app/api/v1/tickets/route'
import { GET as usersGet } from '@/app/api/v1/users/route'
import { GET as userWorkGet } from '@/app/api/v1/users/work/route'
import { GET as teamWorkGet } from '@/app/api/v1/work/route'
import { apiKeyInfo, logMcpUsage } from '@/lib/api-auth'
import { buildToolRequest, MCP_INSTRUCTIONS, MCP_TOOLS, toolInputSchema } from '@/lib/mcp-tools'
import { siteOrigin } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_RESULT_CHARS = 150000

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const ok = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result })
const fail = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** The client's name travels in the session id (not secret, only a label) so later calls can say who is asking. */
const sessionFor = (clientName: string) => `c.${Buffer.from(clientName.slice(0, 40), 'utf8').toString('base64url')}`
function clientFromSession(request: Request): string {
  const sid = request.headers.get('mcp-session-id') ?? ''
  if (!sid.startsWith('c.')) return 'MCP'
  try {
    const name = Buffer.from(sid.slice(2), 'base64url').toString('utf8').replace(/[\u0000-\u001f<>]/g, '').trim()
    return name.length >= 2 ? name : 'MCP'
  } catch {
    return 'MCP'
  }
}

type Handler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Response | Promise<Response>
/** Each tool runs the handler of its API route directly (no network hop), so access, hourly limit and usage log apply as for any other call. */
const HANDLERS: Record<string, Handler> = {
  list_tickets: ticketsGet,
  get_catalog: catalogGet,
  get_ticket: ticketGet,
  get_ticket_history: activityGet,
  list_users: usersGet,
  get_person_work: userWorkGet,
  get_team_work: teamWorkGet,
  get_team_load: teamLoadGet,
  suggest_takeover: suggestGet,
  list_companies: companiesGet,
  get_calendar: calendarEventsGet,
  get_person_availability: calendarStatusGet,
  add_note: notePost,
  update_ticket: ticketPatch,
  create_ticket: ticketsPost,
}

async function callTool(request: Request, params: Record<string, unknown> | undefined) {
  const tool = MCP_TOOLS.find((t) => t.name === params?.name)
  const handler = tool ? HANDLERS[tool.name] : undefined
  if (!tool || !handler) return { content: [{ type: 'text', text: `Unknown tool "${String(params?.name)}"` }], isError: true }
  const args = (params?.arguments as Record<string, unknown>) ?? {}
  const built = buildToolRequest(tool, args, clientFromSession(request))
  if ('error' in built) return { content: [{ type: 'text', text: built.error }], isError: true }

  // The address only carries the path and query; the same key header goes along so the route signs the caller in as usual.
  const headers = new Headers({ authorization: request.headers.get('authorization') ?? '', 'user-agent': `DeskTeam360-MCP (${clientFromSession(request)})` })
  for (const h of ['x-forwarded-for', 'x-real-ip']) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (built.body) headers.set('content-type', 'application/json')
  const inner = new Request(`${new URL(request.url).origin}${built.path}${built.query ? `?${built.query}` : ''}`, { method: tool.method, headers, body: built.body })
  try {
    const res = await handler(inner, { params: Promise.resolve({ id: String(args.id ?? '') }) })
    let text = await res.text()
    if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}\n...(cut: ask for a smaller range or use limit/offset)`
    return { content: [{ type: 'text', text }], isError: !res.ok }
  } catch (e) {
    console.error('[mcp] tool failed:', tool.name, e)
    return { content: [{ type: 'text', text: `The call failed: ${(e as Error).message}` }], isError: true }
  }
}

async function handle(request: Request, msg: RpcRequest, scopes: string[]) {
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '')
      return ok(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'deskteam360', version: '1.0.0' },
        instructions: MCP_INSTRUCTIONS,
      })
    }
    case 'ping':
      return ok(msg.id, {})
    case 'tools/list':
      return ok(msg.id, {
        tools: MCP_TOOLS.filter((t) => scopes.includes(t.scope)).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: toolInputSchema(t),
          annotations: { title: t.name, readOnlyHint: t.method === 'GET', destructiveHint: false, idempotentHint: t.method === 'GET', openWorldHint: false },
        })),
      })
    case 'tools/call':
      return ok(msg.id, await callTool(request, msg.params))
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

/**
 * POST /api/mcp - the MCP server (Streamable HTTP, stateless). Sign in with an API key (`Authorization: Bearer dtk_...`);
 * the key only gets the tools of the access it has. Every tool is a call to the normal API made with that same key.
 */
export async function POST(request: Request) {
  const info = await apiKeyInfo(request)
  const scopes = info?.scopes ?? null
  if (!scopes) {
    // The header points an app such as ChatGPT to the sign-in (OAuth) of this server; apps with an API key just send it.
    return NextResponse.json(fail(null, -32001, 'Unauthorized: send an API key as "Authorization: Bearer dtk_..." (Settings, API Keys), or sign in through OAuth'), {
      status: 401,
      headers: { 'WWW-Authenticate': `Bearer resource_metadata="${siteOrigin(request)}/.well-known/oauth-protected-resource"` },
    })
  }
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(fail(null, -32700, 'Parse error'), { status: 400 })
  }
  const batch = Array.isArray(payload)
  const messages = (batch ? payload : [payload]) as RpcRequest[]
  const headers: Record<string, string> = {}
  const out: unknown[] = []
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') {
      out.push(fail(null, -32600, 'Invalid request'))
      continue
    }
    if (msg.method === 'initialize') {
      const client = String((msg.params?.clientInfo as { name?: unknown } | undefined)?.name ?? 'MCP')
      headers['Mcp-Session-Id'] = sessionFor(client)
    }
    // Connecting and listing the tools are noted in the key's usage log; tool calls are logged by the API route they run.
    if (info && (msg.method === 'initialize' || msg.method === 'tools/list')) logMcpUsage(info.id, request, msg.method)
    // Notifications and responses have no id and get no answer.
    if (msg.id === undefined || msg.id === null) continue
    out.push(await handle(request, msg, scopes))
  }
  if (out.length === 0) return new NextResponse(null, { status: 202 })
  return NextResponse.json(batch ? out : out[0], { headers })
}

/** No server-initiated stream: clients that ask for one are told it is not offered. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

/** Ends a session; there is nothing to clean up. */
export async function DELETE() {
  return new NextResponse(null, { status: 204 })
}
