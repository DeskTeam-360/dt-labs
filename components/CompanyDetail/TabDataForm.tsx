'use client'

import { Card, Form, Button, Space, Row, Col, Spin, Typography, Input } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import type { FormInstance } from 'antd'

const { TextArea } = Input
const { Text } = Typography

interface TabDataFormProps {
  form: FormInstance
  dataTemplates: any[]
  loadingTemplates: boolean
  saving: boolean
  onSaveAll: () => void
}

export default function TabDataForm({
  form,
  dataTemplates,
  loadingTemplates,
  saving,
  onSaveAll,
}: TabDataFormProps) {
  if (loadingTemplates) {
    return (
      <Card>
        <Spin tip="Loading data templates..." />
      </Card>
    )
  }

  return (
    <div>
      <Form form={form} layout="vertical">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={onSaveAll}
              loading={saving}
              size="large"
            >
              Save All
            </Button>
            <Text type="secondary">Save all company data templates</Text>
          </Space>

          {dataTemplates.length > 0 ? (
            (() => {
              const groupedTemplates = dataTemplates.reduce((acc: any, template: any) => {
                const group = template.group || 'Other'
                if (!acc[group]) acc[group] = []
                acc[group].push(template)
                return acc
              }, {})

              return Object.entries(groupedTemplates).map(([group, templates]: [string, any]) => (
                <Card key={group} title={group} style={{ marginBottom: 16 }}>
                  <Row gutter={[16, 16]}>
                    {templates.map((template: any) => (
                      <Col xs={24} sm={12} key={template.id}>
                        <Form.Item
                          label={template.title}
                          name={`template_${template.id}`}
                          tooltip={template.id}
                        >
                          <TextArea
                            rows={3}
                            placeholder={`Enter ${template.title.toLowerCase()}...`}
                            showCount
                          />
                        </Form.Item>
                      </Col>
                    ))}
                  </Row>
                </Card>
              ))
            })()
          ) : (
            <Card>
              <Text type="secondary">No active data templates available</Text>
            </Card>
          )}
        </Space>
      </Form>
    </div>
  )
}
