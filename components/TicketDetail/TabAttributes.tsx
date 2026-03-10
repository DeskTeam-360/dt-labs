'use client'

import { Space, Row, Col, Descriptions, Typography, Button, Input, Empty, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'

const { Text } = Typography

interface Attribute {
  id: string
  ticket_id: number
  meta_key: string
  meta_value: string | null
  created_at: string
  updated_at: string
}

interface TabAttributesProps {
  attributes: Attribute[]
  newAttributeKey: string
  newAttributeValue: string
  onNewAttributeKeyChange: (v: string) => void
  onNewAttributeValueChange: (v: string) => void
  onAddAttribute: () => void
  editingAttribute: string | null
  onEditingAttributeChange: (id: string | null) => void
  onUpdateAttribute: (attributeId: string, newValue: string) => void
  onDeleteAttribute: (attributeId: string) => void
  loading: boolean
}

export default function TabAttributes({
  attributes,
  newAttributeKey,
  newAttributeValue,
  onNewAttributeKeyChange,
  onNewAttributeValueChange,
  onAddAttribute,
  editingAttribute,
  onEditingAttributeChange,
  onUpdateAttribute,
  onDeleteAttribute,
  loading,
}: TabAttributesProps) {
  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={[16, 16]} align="bottom">
        <Col xs={24} sm={10}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Key <Text type="danger">*</Text>
            </Text>
            <Input
              placeholder="Key"
              value={newAttributeKey}
              onChange={(e) => onNewAttributeKeyChange(e.target.value)}
              onPressEnter={onAddAttribute}
            />
          </div>
        </Col>
        <Col xs={24} sm={10}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Value <Text type="danger">*</Text>
            </Text>
            <Input
              placeholder="Value"
              value={newAttributeValue}
              onChange={(e) => onNewAttributeValueChange(e.target.value)}
              onPressEnter={onAddAttribute}
            />
          </div>
        </Col>
        <Col xs={24} sm={4}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onAddAttribute}
            loading={loading}
            block
            style={{ height: 32 }}
          >
            Add
          </Button>
        </Col>
      </Row>

      {attributes.length > 0 ? (
        <Descriptions column={1} bordered style={{ marginTop: 16 }}>
          {attributes.map((attr) => (
            <Descriptions.Item
              key={attr.id}
              label={
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong>{attr.meta_key}</Text>
                  <Space>
                    {editingAttribute === attr.id ? (
                      <Button
                        type="text"
                        size="small"
                        onClick={() => onEditingAttributeChange(null)}
                      >
                        Cancel
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          size="middle"
                          onClick={() => onEditingAttributeChange(attr.id)}
                        />
                        <Popconfirm
                          title="Delete attribute"
                          description="Are you sure?"
                          onConfirm={() => onDeleteAttribute(attr.id)}
                          okText="Yes"
                          cancelText="No"
                        >
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            size="middle"
                          />
                        </Popconfirm>
                      </>
                    )}
                  </Space>
                </Space>
              }
            >
              {editingAttribute === attr.id ? (
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    defaultValue={attr.meta_value || ''}
                    onPressEnter={(e) => {
                      onUpdateAttribute(attr.id, e.currentTarget.value)
                    }}
                    onBlur={(e) => {
                      onUpdateAttribute(attr.id, e.target.value)
                    }}
                    autoFocus
                    style={{ width: '100%' }}
                  />
                </Space.Compact>
              ) : (
                <Text>{attr.meta_value || <Text type="secondary">(empty)</Text>}</Text>
              )}
            </Descriptions.Item>
          ))}
        </Descriptions>
      ) : (
        <Empty description="No attributes" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Space>
  )
}
