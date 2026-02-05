'use client'

import { Descriptions, Space, Typography } from 'antd'
import DateDisplay from '../DateDisplay'

const { Text } = Typography

interface TabUsersProps {
  companyData: any
}

export default function TabUsers({ companyData }: TabUsersProps) {
  const companyUsers = companyData.company_users || []

  return (
    <>
      {companyUsers.length > 0 ? (
        <Descriptions bordered column={1}>
          {companyUsers.map((cu: any, index: number) => (
            <Descriptions.Item
              key={index}
              label={cu.users?.full_name || cu.users?.email || 'User'}
            >
              <Space direction="vertical" size="small">
                <Text>
                  <strong>Email:</strong> {cu.users?.email || 'N/A'}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Added: <DateDisplay date={cu.created_at} />
                </Text>
              </Space>
            </Descriptions.Item>
          ))}
        </Descriptions>
      ) : (
        <Text type="secondary">No users assigned to this company</Text>
      )}
    </>
  )
}
