'use client'

import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { Col, Descriptions, Row, Space,Tag, Typography } from 'antd'

import DateDisplay from '../DateDisplay'

const { Text } = Typography

interface TabInfoProps {
  companyData: any
  groupedDatas: Record<string, any[]>
}

export default function TabInfo({ companyData, groupedDatas }: TabInfoProps) {
  return (
    <>
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={24}>
          <Text strong style={{ fontSize: 18, textTransform: 'uppercase' }}>Basic Information</Text>
          <br />
          <Descriptions column={1} bordered style={{ marginTop: 16 }}>
            <Descriptions.Item label="Company Name">
              <Text strong>{companyData.name}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {companyData.email ? (
                <a href={`mailto:${companyData.email}`}>{companyData.email}</a>
              ) : (
                <Text type="secondary">—</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={companyData.is_active ? 'green' : 'default'} style={{ fontSize: 14, padding: '4px 12px' }}>
                {companyData.is_active ? (
                  <>
                    <CheckCircleOutlined /> ACTIVE
                  </>
                ) : (
                  <>
                    <CloseCircleOutlined /> INACTIVE
                  </>
                )}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Company ID">
              <Text code style={{ fontSize: 12 }}>
                {companyData.id}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Created At">
              <Space>
                <CalendarOutlined />
                <DateDisplay date={companyData.created_at} format="detailed" />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Last Updated">
              <Space>
                <ClockCircleOutlined />
                <DateDisplay date={companyData.updated_at} format="detailed" />
              </Space>
            </Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>
      <br />
      <div>
        {Object.keys(groupedDatas).length > 0 ? (
          Object.entries(groupedDatas).map(([group, items]: [string, any]) => (
            <div key={group}>
              <Text strong style={{ fontSize: 18, textTransform: 'uppercase' }}>{group}</Text>
              <Descriptions bordered column={1} style={{ marginTop: 16 }}>
                {items.map((item: any, index: number) => (
                  <Descriptions.Item
                    key={index}
                    label={item.company_data_templates?.title || 'Data'}
                  >
                    <Space orientation="vertical" size="small">
                      <Text>{item.value || 'N/A'}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Updated: <DateDisplay date={item.updated_at} />
                      </Text>
                    </Space>
                  </Descriptions.Item>
                ))}
              </Descriptions>
              <br />
            </div>
          ))
        ) : (
          <Text type="secondary">No data available for this company</Text>
        )}
      </div>
    </>
  )
}
