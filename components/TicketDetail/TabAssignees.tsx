'use client'

import { Card, Space, Typography, Avatar, Empty, Tag } from 'antd'
import { UserOutlined } from '@ant-design/icons'

const { Text } = Typography

interface TabAssigneesProps {
  ticketData: {
    id?: number
    visibility?: string
    team_id?: string | null
    assignees?: Array<{
      user?: { avatar_url?: string; full_name?: string | null; email?: string | null }
    }>
  }
  teamMembers: Array<{
    role?: string
    user?: { avatar_url?: string; full_name?: string | null; email?: string | null }
  }>
  loading: boolean
}

export default function TabAssignees({ ticketData, teamMembers, loading }: TabAssigneesProps) {
  return (
    <Card
      title={
        <Space>
          <UserOutlined />
          <Text strong>Assignees</Text>
        </Space>
      }
      size="small"
      loading={loading}
    >
      {ticketData.visibility === 'private' ? (
        <Empty description="No Assignees for this private ticket" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : ticketData.visibility === 'team' && ticketData.team_id ? (
        teamMembers.length > 0 ? (
          <Space orientation="vertical" style={{ width: '100%' }} size={8}>
            {teamMembers.map((member, idx) => (
              <div
                key={member.user?.email ?? `tm-${idx}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Avatar icon={<UserOutlined />} src={member.user?.avatar_url} />
                <Text>{member.user?.full_name || member.user?.email || 'Unknown'}</Text>
                {member.role && (
                  <Tag color={member.role === 'manager' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                    {member.role}
                  </Tag>
                )}
              </div>
            ))}
          </Space>
        ) : (
          <Empty description="No team members" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )
      ) : ticketData.assignees && ticketData.assignees.length > 0 ? (
        <Space orientation="vertical" style={{ width: '100%' }} size={8}>
          {ticketData.assignees.map((assignee, idx) => (
            <div
              key={assignee.user?.email ?? `as-${idx}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Avatar icon={<UserOutlined />} src={assignee.user?.avatar_url} />
              <Text>{assignee.user?.full_name || assignee.user?.email || 'Unknown'}</Text>
            </div>
          ))}
        </Space>
      ) : (
        <Empty description="No assignees" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Card>
  )
}
