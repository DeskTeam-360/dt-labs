import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import OAuthConsent from '@/components/content/settings/OAuthConsent'
import { allowedScopesForRole } from '@/lib/api-scopes'
import { canManageApiKeys } from '@/lib/auth-utils'
import { db, oauthClients } from '@/lib/db'
import { connectionLimitMessage } from '@/lib/oauth'

type Search = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

const Message = ({ title, text }: { title: string; text: string }) => (
  <div style={{ maxWidth: 520, margin: '80px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
    <h2>{title}</h2>
    <p>{text}</p>
  </div>
)

/** Where an app such as ChatGPT sends a person to approve its connection. The person must be signed in. */
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams
  const clientId = one(q.client_id)
  const redirectUri = one(q.redirect_uri)
  const [client] = clientId ? await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1).catch(() => []) : []
  // A wrong app or address is never redirected to: only shown, so nobody can be sent to an address the app did not register.
  if (!client || !client.redirectUris.includes(redirectUri)) return <Message title="Cannot connect" text="This app or its return address is not known. Go back to the app and start the connection again." />
  if (one(q.response_type) !== 'code' || one(q.code_challenge_method) !== 'S256' || !one(q.code_challenge)) {
    return <Message title="Cannot connect" text="The app did not ask for the sign-in in the way we require (code with PKCE S256). Go back and try again." />
  }

  const session = await auth()
  if (!session?.user?.id) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]))).toString()}`
    redirect(`/login?next=${encodeURIComponent(here)}`)
  }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!canManageApiKeys(role)) return <Message title="Not allowed" text="Only team members can connect an app to DeskTeam360." />

  const limited = await connectionLimitMessage(session.user.id, role)
  if (limited) return <Message title="You already have a connection" text={limited} />

  return <OAuthConsent clientName={client.name} clientId={client.id} redirectUri={redirectUri} codeChallenge={one(q.code_challenge)} state={one(q.state)} userName={session.user.name ?? session.user.email ?? ''} allowedScopes={allowedScopesForRole(role)} />
}
