'use client'

import { Flex, Typography } from 'antd'

import TicketUserMention from './TicketUserMention'

const { Text } = Typography

export type CommentTaggedUser = { id: string; full_name: string | null; email: string }

type Props = {
  tagged_users?: CommentTaggedUser[]
  tagged_user_ids?: string[]
  cc_emails?: string[]
  bcc_emails?: string[]
  /** When `tagged_users` is missing, resolve display from ids (e.g. sidebar user lists). */
  resolveUser?: (id: string) => { email?: string | null; label: string } | null
}

/** Ant Design `Typography.Text` sets font-size on the node itself, so parent `Flex` fontSize does not apply. */
const META_FONT_PX = 10

export default function CommentTaggedCcLines({
  tagged_users,
  tagged_user_ids,
  cc_emails,
  bcc_emails,
  resolveUser,
}: Props) {
  const metaTextStyle = { fontSize: META_FONT_PX, lineHeight: 1.35 } as const
  const hasTagged = (tagged_users?.length ?? 0) > 0 || (tagged_user_ids?.length ?? 0) > 0
  const hasCc = (cc_emails?.length ?? 0) > 0 || (bcc_emails?.length ?? 0) > 0
  if (!hasTagged && !hasCc) return null

  const taggedEntries: { id: string; email?: string | null; label: string }[] =
    tagged_users && tagged_users.length > 0
      ? tagged_users.map((u) => ({ id: u.id, email: u.email, label: u.full_name || u.email }))
      : (tagged_user_ids ?? []).map((id) => {
          const r = resolveUser?.(id)
          return { id, email: r?.email, label: r?.label ?? id }
        })

  return (
    <Flex vertical gap={4} style={{ marginTop: 6, width: '100%', fontSize: META_FONT_PX }}>
      {taggedEntries.length > 0 ? (
        <Flex wrap="wrap" gap={6} align="baseline" style={{ fontSize: META_FONT_PX }}>
          <Text type="secondary" style={{ flexShrink: 0, ...metaTextStyle }}>
          Notified to:
          </Text>
          <span style={metaTextStyle}>
            {taggedEntries.map((entry, i) => (
              <span key={entry.id}>
                {i > 0 ? ', ' : null}
                <TicketUserMention userId={entry.id} email={entry.email}>
                  <Text type="secondary" style={{ ...metaTextStyle, cursor: entry.id ? 'pointer' : undefined }}>
                    {entry.label}
                  </Text>
                </TicketUserMention>
              </span>
            ))}
          </span>
        </Flex>
      ) : null}
      {hasCc ? (
        <Flex gap={12} wrap="wrap" style={{ fontSize: META_FONT_PX }}>
          {cc_emails?.length ? (
            <Text type="secondary" style={metaTextStyle}>
              CC to: {cc_emails.join(', ')}
            </Text>
          ) : null}
          {bcc_emails?.length ? (
            <Text type="secondary" style={metaTextStyle}>
              BCC to: {bcc_emails.join(', ')}
            </Text>
          ) : null}
        </Flex>
      ) : null}
    </Flex>
  )
}
