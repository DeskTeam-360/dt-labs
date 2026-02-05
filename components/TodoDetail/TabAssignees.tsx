'use client'

import {
  Card,
  List,
  Space,
  Typography,
  Avatar,
  Empty,
  Tag,
  Button,
} from 'antd'
import { UserOutlined, ClockCircleOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import DateDisplay from '../DateDisplay'

const { Text } = Typography

interface TabAssigneesProps {
  todoData: any
  teamMembers: any[]
  loading: boolean
  totalTimeSeconds: number
  activeTimeTracker: any
  currentTime: number
  formatTime: (seconds: number) => string
  timeTrackerSessions: any[]
  timeTrackerLoading?: boolean
  onStartTimeTracker: () => void
  onStopTimeTracker: () => void
}

export default function TabAssignees({
  todoData,
  teamMembers,
  loading,
  totalTimeSeconds,
  activeTimeTracker,
  currentTime,
  formatTime,
  timeTrackerSessions,
  timeTrackerLoading = false,
  onStartTimeTracker,
  onStopTimeTracker,
}: TabAssigneesProps) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <Text strong>Time Tracker</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total: {formatTime(totalTimeSeconds + (activeTimeTracker ? currentTime : 0))}
            </Text>
          </Space>
        }
        size="small"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space>
            {activeTimeTracker ? (
              <>
                <Button
                  type="primary"
                  danger
                  icon={<StopOutlined />}
                  onClick={onStopTimeTracker}
                  loading={timeTrackerLoading}
                >
                  Stop
                </Button>
                <Text strong style={{ fontSize: 18 }}>
                  {formatTime(currentTime)}
                </Text>
                <Text type="secondary">(running)</Text>
              </>
            ) : (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={onStartTimeTracker}
                loading={timeTrackerLoading}
              >
                Start Timer
              </Button>
            )}
          </Space>
          {timeTrackerSessions.length > 0 ? (
            <List
              size="small"
              dataSource={timeTrackerSessions}
              renderItem={(session: any) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} size="small" />}
                    title={
                      <Space size="small">
                        <Text strong style={{ fontSize: 13 }}>
                          {session.user?.full_name || session.user?.email || 'Unknown'}
                        </Text>
                        {!session.stop_time && (
                          <Tag color="processing">Active</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Started: <DateDisplay date={session.start_time} />
                        </Text>
                        {session.stop_time && (
                          <>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              Stopped: <DateDisplay date={session.stop_time} />
                            </Text>
                            <Text strong style={{ fontSize: 12 }}>
                              Duration: {formatTime(session.duration_seconds || 0)}
                            </Text>
                          </>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description="No time tracking sessions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Space>
      </Card>

      <Card title="Assignees" size="small" loading={loading}>
        {todoData.visibility === 'private' ? (
          <Empty description="No Assignees this private todo" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : todoData.visibility === 'team' && todoData.team_id ? (
          teamMembers.length > 0 ? (
            <List
              dataSource={teamMembers}
              renderItem={(member: any) => (
                <List.Item>
                  <Space>
                    <Avatar icon={<UserOutlined />} />
                    <Text>
                      {member.user?.full_name || member.user?.email || 'Unknown'}
                    </Text>
                    {member.role && (
                      <Tag color={member.role === 'manager' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                        {member.role}
                      </Tag>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="No team members" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )
        ) : (
          todoData.assignees && todoData.assignees.length > 0 ? (
            <List
              dataSource={todoData.assignees}
              renderItem={(assignee: any) => (
                <List.Item>
                  <Space>
                    <Avatar icon={<UserOutlined />} />
                    <Text>
                      {assignee.user?.full_name || assignee.user?.email || 'Unknown'}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="No assignees" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )
        )}
      </Card>
    </Space>
  )
}
