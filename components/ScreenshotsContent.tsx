'use client'

import { Layout, Card, Row, Col, Image, Typography, Select, DatePicker, Button, Space, Tag, Modal, message, Empty } from 'antd'
import { PictureOutlined, LinkOutlined, CopyOutlined, DeleteOutlined, EditOutlined, CalendarOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import AdminSidebar from './AdminSidebar'
import dayjs, { Dayjs } from 'dayjs'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

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
  tags: string[] | null
  created_at: string
  updated_at: string
  tickets?: {
    id: number
    title: string
    status: string
  } | null
}

interface Todo {
  id: number
  title: string
  status: string
  due_date: string | null
}

interface ScreenshotsContentProps {
  user: User
  screenshots: Screenshot[]
  todos: Todo[]
}

export default function ScreenshotsContent({ user, screenshots: initialScreenshots, todos }: ScreenshotsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [screenshots, setScreenshots] = useState<Screenshot[]>(initialScreenshots)
  const [filteredScreenshots, setFilteredScreenshots] = useState<Screenshot[]>(initialScreenshots)
  const [selectedTodo, setSelectedTodo] = useState<number | null>(null)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  // Filter screenshots
  useEffect(() => {
    let filtered = [...screenshots]

    // Filter by todo
    if (selectedTodo) {
      filtered = filtered.filter(s => s.todo_id === selectedTodo)
    }

    // Filter by date range
    if (dateRange[0] && dateRange[1]) {
      filtered = filtered.filter(s => {
        const screenshotDate = dayjs(s.created_at)
        return screenshotDate.isAfter(dateRange[0]!.subtract(1, 'day')) && 
               screenshotDate.isBefore(dateRange[1]!.add(1, 'day'))
      })
    }

    setFilteredScreenshots(filtered)
  }, [screenshots, selectedTodo, dateRange])

  // Link screenshot to todo
  const handleLinkToTodo = async (screenshotId: string, todoId: string | null) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('screenshots')
        .update({ todo_id: todoId })
        .eq('id', screenshotId)
        .eq('user_id', user.id)

      if (error) throw error

      // Update local state
      setScreenshots(prev => prev.map(s => 
        s.id === screenshotId ? { ...s, todo_id: todoId } : s
      ))

      message.success('Screenshot linked to todo successfully')
    } catch (error: any) {
      message.error(error.message || 'Failed to link screenshot')
    } finally {
      setLoading(false)
    }
  }

  // Delete screenshot
  const handleDelete = async (screenshot: Screenshot) => {
    if (!confirm('Are you sure you want to delete this screenshot?')) return

    setLoading(true)
    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from('screenshots')
        .delete()
        .eq('id', screenshot.id)
        .eq('user_id', user.id)

      if (dbError) throw dbError

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('dtlabs')
        .remove([screenshot.file_path])

      if (storageError) {
        console.error('Error deleting from storage:', storageError)
        // Continue anyway, database record is deleted
      }

      // Update local state
      setScreenshots(prev => prev.filter(s => s.id !== screenshot.id))
      message.success('Screenshot deleted successfully')
    } catch (error: any) {
      message.error(error.message || 'Failed to delete screenshot')
    } finally {
      setLoading(false)
    }
  }

  // Copy URL
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    message.success('URL copied to clipboard!')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        <Content style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
          <Card>
            <Title level={2}>
              <PictureOutlined /> Screenshots Gallery
            </Title>
            <Text type="secondary">View and manage your screenshots</Text>

            {/* Filters */}
            <div style={{ marginTop: 24, marginBottom: 24 }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Filter by Todo:</Text>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="All todos"
                    allowClear
                    value={selectedTodo}
                    onChange={setSelectedTodo}
                  >
                    <Option value={null}>All Screenshots</Option>
                    {todos.map(todo => (
                      <Option key={todo.id} value={todo.id}>
                        {todo.title} ({todo.status})
                      </Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Filter by Date:</Text>
                  <RangePicker
                    style={{ width: '100%' }}
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
                    format="YYYY-MM-DD"
                  />
                </Col>
                <Col xs={24} sm={24} md={8}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Total:</Text>
                  <Text style={{ fontSize: 18, fontWeight: 600 }}>
                    {filteredScreenshots.length} screenshot{filteredScreenshots.length !== 1 ? 's' : ''}
                  </Text>
                </Col>
              </Row>
            </div>

            {/* Gallery Grid */}
            {filteredScreenshots.length === 0 ? (
              <Empty description="No screenshots found" />
            ) : (
              <Row gutter={[16, 16]}>
                {filteredScreenshots.map(screenshot => (
                  <Col xs={24} sm={12} md={8} lg={6} key={screenshot.id}>
                    <Card
                      hoverable
                      cover={
                        <div style={{ height: 200, overflow: 'hidden', background: '#f5f5f5' }}>
                          <Image
                            src={screenshot.file_url}
                            alt={screenshot.title || screenshot.file_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            preview={false}
                            onClick={() => {
                              setSelectedScreenshot(screenshot)
                              setModalVisible(true)
                            }}
                          />
                        </div>
                      }
                      actions={[
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setSelectedScreenshot(screenshot)
                            setModalVisible(true)
                          }}
                        />,
                        <Button
                          type="text"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyUrl(screenshot.file_url)}
                        />,
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDelete(screenshot)}
                        />
                      ]}
                    >
                      <Card.Meta
                        title={
                          <div>
                            <Text ellipsis style={{ fontSize: 12 }}>
                              {screenshot.title || screenshot.file_name}
                            </Text>
                            {screenshot.tickets && (
                              <Tag color="blue" style={{ marginTop: 4, display: 'block' }}>
                                {screenshot.tickets.title}
                              </Tag>
                            )}
                          </div>
                        }
                        description={
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <CalendarOutlined /> {dayjs(screenshot.created_at).format('YYYY-MM-DD HH:mm')}
                            </Text>
                          </div>
                        }
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Card>
        </Content>
      </Layout>

      {/* Modal for screenshot details */}
      <Modal
        title="Screenshot Details"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setSelectedScreenshot(null)
        }}
        footer={null}
        width={800}
      >
        {selectedScreenshot && (
          <div>
            <Image
              src={selectedScreenshot.file_url}
              alt={selectedScreenshot.title || selectedScreenshot.file_name}
              style={{ width: '100%', marginBottom: 16 }}
            />
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>Link to Todo:</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="Select a todo"
                  value={selectedScreenshot.todo_id}
                  onChange={(todoId) => handleLinkToTodo(selectedScreenshot.id, todoId)}
                >
                  <Option value={null}>No Todo</Option>
                  {todos.map(todo => (
                    <Option key={todo.id} value={todo.id}>
                      {todo.title} ({todo.status})
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong>URL:</Text>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <Text code style={{ flex: 1, fontSize: 11, wordBreak: 'break-all' }}>
                    {selectedScreenshot.file_url}
                  </Text>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyUrl(selectedScreenshot.file_url)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div>
                <Text strong>Created:</Text>
                <Text style={{ marginLeft: 8 }}>
                  {dayjs(selectedScreenshot.created_at).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
              </div>
            </Space>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
