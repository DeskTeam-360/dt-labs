'use client'

import { Alert, Button, Card, Checkbox, Flex, message, Tag, Typography } from 'antd'
import { useState } from 'react'

import { API_SCOPES, isWriteScope } from '@/lib/api-scopes'

const { Title, Text, Paragraph } = Typography

type Props = { clientName: string; clientId: string; redirectUri: string; codeChallenge: string; state: string; userName: string }

/** The page where a signed-in person approves what an app such as ChatGPT may do, and picks the access it gets. */
export default function OAuthConsent({ clientName, clientId, redirectUri, codeChallenge, state, userName }: Props) {
  // Only the reading accesses start ticked; changing data has to be chosen on purpose.
  const [scopes, setScopes] = useState<string[]>(API_SCOPES.filter((s) => !isWriteScope(s.key)).map((s) => s.key))
  const [busy, setBusy] = useState(false)
  const writes = scopes.filter(isWriteScope)

  const send = async (approve: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, state, scopes, approve }),
      })
      const j = (await res.json()) as { redirect?: string; error?: string }
      if (!res.ok || !j.redirect) throw new Error(j.error || 'Could not connect')
      window.location.href = j.redirect
    } catch (e) {
      message.error((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: '40px auto', padding: '0 16px' }}>
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>Connect {clientName} to DeskTeam360</Title>
        <Paragraph type="secondary">
          {clientName} is asking to act as you ({userName}). It only gets the access you tick below. You can change or switch it off any time in Settings, API Keys.
        </Paragraph>
        <Checkbox.Group value={scopes} onChange={(v) => setScopes(v as string[])} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {API_SCOPES.map((s) => (
            <Checkbox key={s.key} value={s.key}>
              <Text strong>{s.label}</Text>
              {isWriteScope(s.key) ? <Tag color="orange" style={{ marginLeft: 8 }}>Changes data</Tag> : null}
              <div><Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text></div>
            </Checkbox>
          ))}
        </Checkbox.Group>
        {writes.length > 0 ? (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            showIcon
            message="Do you authorize this app to change data?"
            description="It can make changes as you, including emails and notifications sent to customers and your team. Only allow it for an app you trust."
          />
        ) : null}
        <Flex gap={8} justify="flex-end" style={{ marginTop: 20 }}>
          <Button disabled={busy} onClick={() => void send(false)}>Cancel</Button>
          <Button type="primary" loading={busy} disabled={scopes.length === 0} onClick={() => void send(true)}>Allow</Button>
        </Flex>
      </Card>
    </div>
  )
}
