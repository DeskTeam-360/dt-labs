'use client'

import { CheckCircleFilled, CloseCircleFilled, ExperimentOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Input, Space, Typography } from 'antd'
import { useState } from 'react'

const { Text } = Typography

type Check = { text: string; passed: boolean; depth: number; group?: 'AND' | 'OR' }
type Result = {
  ticket: { id: number; title: string }
  would_run: boolean
  event_note: string | null
  company_ok: boolean
  company_note: string | null
  checks: Check[]
  actions: string[]
  context_note: string
}

/**
 * "Test this rule": runs the rule as it is in the form (saved or not) against one ticket and shows which
 * conditions pass and what the actions would do. Nothing on the ticket changes.
 */
export default function RuleTestPanel({ getRule, bare = false }: { getRule: () => Record<string, unknown>; bare?: boolean }) {
  const [ticket, setTicket] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/automation-rules/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.trim(), rule: getRule() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
      setResult(data as Result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      size="small"
      variant={bare ? 'borderless' : undefined}
      title={bare ? undefined : <Space><ExperimentOutlined />Test this rule on a ticket</Space>}
      style={{ marginBottom: bare ? 0 : 16 }}
      styles={bare ? { body: { padding: 0 } } : undefined}
    >
      <Flex gap={8} wrap align="center">
        <Input
          placeholder="Ticket number, e.g. 204730"
          style={{ width: 240 }}
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          onPressEnter={() => void run()}
        />
        <Button onClick={() => void run()} loading={loading} disabled={!ticket.trim()}>
          Run test
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>Nothing on the ticket changes. Uses the rule as it is in this form, saved or not.</Text>
      </Flex>

      {error ? <Alert type="error" showIcon style={{ marginTop: 12 }} title={error} /> : null}

      {result ? (
        <Flex vertical gap={10} style={{ marginTop: 12 }}>
          <Alert
            type={result.would_run ? 'success' : 'warning'}
            showIcon
            title={
              result.would_run
                ? `This rule would run on #${result.ticket.id} ${result.ticket.title}`
                : `This rule would not run on #${result.ticket.id} ${result.ticket.title}`
            }
            description={[result.event_note, result.company_note].filter(Boolean).join(' ') || undefined}
          />

          <div>
            <Text strong>Conditions</Text>
            <div style={{ marginTop: 4 }}>
              {result.checks.length === 0 ? (
                <Text type="secondary">No conditions: the rule would run on every ticket.</Text>
              ) : (
                result.checks.map((c, i) => (
                  <div key={i} style={{ paddingLeft: c.depth * 20, display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 2 }}>
                    {c.passed ? (
                      <CheckCircleFilled style={{ color: '#52c41a', marginTop: 4 }} />
                    ) : (
                      <CloseCircleFilled style={{ color: '#ff4d4f', marginTop: 4 }} />
                    )}
                    <Text strong={!!c.group}>{c.text}</Text>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <Text strong>{result.would_run ? 'What it would do' : 'What it would do if it ran'}</Text>
            {result.actions.length === 0 ? (
              <div><Text type="secondary">No actions yet.</Text></div>
            ) : (
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {result.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>

          <Text type="secondary" style={{ fontSize: 12 }}>{result.context_note}</Text>
        </Flex>
      ) : null}
    </Card>
  )
}
