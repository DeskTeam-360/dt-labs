'use client'

import { Alert, Space, Typography, Tag, message } from 'antd'
import {
  MESSAGE_TEMPLATE_RECIPIENT_PLACEHOLDERS,
  MESSAGE_TEMPLATE_SENDER_PLACEHOLDERS,
  MESSAGE_TEMPLATE_TICKET_PLACEHOLDERS,
  wrapPlaceholderKey,
} from '@/lib/message-template-placeholders'

const { Text, Paragraph } = Typography

function PlaceholderTag({ token }: { token: string }) {
  const full = wrapPlaceholderKey(token)
  return (
    <Tag
      style={{ cursor: 'pointer', fontFamily: 'monospace', marginBottom: 4 }}
      onClick={() => {
        void navigator.clipboard?.writeText(full).then(() => message.success('Copied'))
      }}
      title="Click to copy"
    >
      {full}
    </Tag>
  )
}

export default function MessageTemplatePlaceholdersPanel() {
  return (
    <Alert
      type="info"
      showIcon
      message="Merge fields"
      description={
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Paragraph style={{ marginBottom: 8 }}>
            Type placeholders exactly as shown. They stay in the saved HTML; your app replaces them when the message
            is sent. Keys starting with <code>recipient.</code> come from the recipient&apos;s <code>users</code> row;
            later, <code>sender.*</code> will refer to the sending user. Ticket keys have no prefix.
          </Paragraph>
          <div>
            <Text strong>Recipient</Text>
            <div style={{ marginTop: 6 }}>
              {MESSAGE_TEMPLATE_RECIPIENT_PLACEHOLDERS.map(({ key, description }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <PlaceholderTag token={key} />
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                    {description}
                  </Text>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Text strong>Sender</Text>
            <div style={{ marginTop: 6 }}>
              {MESSAGE_TEMPLATE_SENDER_PLACEHOLDERS.map(({ key, description }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <PlaceholderTag token={key} />
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                    {description}
                  </Text>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Text strong>Ticket</Text>
            <div style={{ marginTop: 6 }}>
              {MESSAGE_TEMPLATE_TICKET_PLACEHOLDERS.map(({ key, description }) => (
                <div key={key} style={{ marginBottom: 6 }}>
                  <PlaceholderTag token={key} />
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                    {description}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </Space>
      }
    />
  )
}
