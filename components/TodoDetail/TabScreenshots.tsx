'use client'

import { Space, Row, Col, Card, Typography, Button, Empty } from 'antd'
import { LinkOutlined, CopyOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { message } from 'antd'

const { Text } = Typography

interface Screenshot {
  id: string
  file_name: string
  file_path: string
  file_url: string
  file_size: number
  mime_type: string
  todo_id: number | null
  title: string | null
  description: string | null
  created_at: string
  updated_at: string
}

interface TabScreenshotsProps {
  screenshots: Screenshot[]
}

export default function TabScreenshots({ screenshots }: TabScreenshotsProps) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {screenshots.length > 0 ? (
        <Row gutter={[16, 16]}>
          {screenshots.map((screenshot) => (
            <Col xs={24} sm={12} md={8} lg={6} key={screenshot.id}>
              <Card
                hoverable
                cover={
                  <div style={{ height: 150, overflow: 'hidden', background: '#f5f5f5' }}>
                    <img
                      src={screenshot.file_url}
                      alt={screenshot.title || screenshot.file_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                }
                actions={[
                  <Button
                    key="link"
                    type="text"
                    icon={<LinkOutlined />}
                    onClick={() => window.open(screenshot.file_url, '_blank')}
                  />,
                  <Button
                    key="copy"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(screenshot.file_url)
                      message.success('URL copied!')
                    }}
                  />,
                ]}
              >
                <Card.Meta
                  title={
                    <Text ellipsis style={{ fontSize: 12 }}>
                      {screenshot.title || screenshot.file_name}
                    </Text>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {dayjs(screenshot.created_at).format('YYYY-MM-DD HH:mm')}
                    </Text>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Empty
          description="No screenshots linked to this todo"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </Space>
  )
}
