'use client'

import { Layout, Button, Select, DatePicker, Input, Space, Typography, Badge, Tooltip } from 'antd'

const { Sider } = Layout
import { FilterOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { StatusColumn } from './types'
import type { Dayjs } from 'dayjs'

const { Text } = Typography
const { Option } = Select

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'team', label: 'Team' },
  { value: 'specific_users', label: 'Specific Users' },
  { value: 'public', label: 'Public' },
]

interface FilterSidebarProps {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  filterStatus: string[]
  onFilterStatusChange: (v: string[]) => void
  filterTypeIds: number[]
  onFilterTypeIdsChange: (v: number[]) => void
  filterCompanyIds: string[]
  onFilterCompanyIdsChange: (v: string[]) => void
  filterTagIds: string[]
  onFilterTagIdsChange: (v: string[]) => void
  filterVisibility: string[]
  onFilterVisibilityChange: (v: string[]) => void
  filterTeamIds: string[]
  onFilterTeamIdsChange: (v: string[]) => void
  filterDateRange: [Dayjs | null, Dayjs | null] | null
  onFilterDateRangeChange: (dates: [Dayjs | null, Dayjs | null] | null) => void
  filterSearch: string
  onFilterSearchChange: (v: string) => void
  allStatuses: { slug: string; title: string }[]
  ticketTypes: Array<{ id: number; title: string; color: string }>
  teams: Array<{ id: string; name: string }>
  companies: Array<{ id: string; name: string }>
  allTags: Array<{ id: string; name: string }>
  hasActiveFilters: boolean
  filteredCount: number
  totalCount: number
  onClearFilters: () => void
  /** When true, show only Status, Type, Date Range, Search */
  isCustomer?: boolean
}

export default function FilterSidebar({
  collapsed,
  onCollapsedChange,
  filterStatus,
  onFilterStatusChange,
  filterTypeIds,
  onFilterTypeIdsChange,
  filterCompanyIds,
  onFilterCompanyIdsChange,
  filterTagIds,
  onFilterTagIdsChange,
  filterVisibility,
  onFilterVisibilityChange,
  filterTeamIds,
  onFilterTeamIdsChange,
  filterDateRange,
  onFilterDateRangeChange,
  filterSearch,
  onFilterSearchChange,
  allStatuses,
  ticketTypes,
  teams,
  companies,
  allTags,
  hasActiveFilters,
  filteredCount,
  totalCount,
  onClearFilters,
  isCustomer = false,
}: FilterSidebarProps) {
  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      collapsedWidth={48}
      width={280}
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        background: '#001529',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0 16px' : '0 16px 0 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {!collapsed && (
          <span style={{ color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FilterOutlined />
            Filters
          </span>
        )}
        <Button
          type="text"
          icon={collapsed ? <LeftOutlined /> : <RightOutlined />}
          onClick={() => onCollapsedChange(!collapsed)}
          style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16 }}
        />
      </div>
      {!collapsed && (
        <div style={{ padding: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Status</Text>
              <Select
                mode="multiple"
                placeholder="All statuses"
                allowClear
                style={{ width: '100%' }}
                value={filterStatus}
                onChange={(v) => onFilterStatusChange(v ?? [])}
                options={allStatuses.map((s) => ({ value: s.slug, label: s.title }))}
                maxTagCount="responsive"
              />
            </div>
            <div>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Type</Text>
              <Select
                mode="multiple"
                placeholder="All types"
                allowClear
                style={{ width: '100%' }}
                value={filterTypeIds}
                onChange={(v) => onFilterTypeIdsChange(v ?? [])}
                maxTagCount="responsive"
              >
                {ticketTypes.map((t) => (
                  <Option key={t.id} value={t.id}>
                    <Space>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: t.color }} />
                      {t.title}
                    </Space>
                  </Option>
                ))}
              </Select>
            </div>
            {!isCustomer && (
              <>
                <div>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Visibility</Text>
                  <Select
                    mode="multiple"
                    placeholder="All visibility"
                    allowClear
                    style={{ width: '100%' }}
                    value={filterVisibility}
                    onChange={(v) => onFilterVisibilityChange(v ?? [])}
                    options={VISIBILITY_OPTIONS}
                    maxTagCount="responsive"
                  />
                </div>
                <div>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Team</Text>
                  <Select
                    mode="multiple"
                    placeholder="All teams"
                    allowClear
                    style={{ width: '100%' }}
                    value={filterTeamIds}
                    onChange={(v) => onFilterTeamIdsChange(v ?? [])}
                    maxTagCount="responsive"
                  >
                    {teams.map((t) => (
                      <Option key={t.id} value={t.id}>{t.name}</Option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Company</Text>
                  <Select
                    mode="multiple"
                    placeholder="All companies"
                    allowClear
                    style={{ width: '100%' }}
                    value={filterCompanyIds}
                    onChange={(v) => onFilterCompanyIdsChange(v ?? [])}
                    maxTagCount="responsive"
                  >
                    {companies.map((c) => (
                      <Option key={c.id} value={c.id}>{c.name}</Option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Tags</Text>
                  <Select
                    mode="multiple"
                    placeholder="All tags"
                    allowClear
                    style={{ width: '100%' }}
                    value={filterTagIds}
                    onChange={onFilterTagIdsChange}
                    optionLabelProp="label"
                    maxTagCount="responsive"
                  >
                    {allTags.map((t) => (
                      <Option key={t.id} value={t.id} label={t.name}>{t.name}</Option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            <div>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.65)' }}>Date range</Text>
              <DatePicker.RangePicker
                value={filterDateRange}
                onChange={(dates) => onFilterDateRangeChange(dates)}
                allowClear
                style={{ width: '100%' }}
                placeholder={['Start', 'End']}
              />
            </div>
            {hasActiveFilters && (
              <>
                <Button type="link" size="small" onClick={onClearFilters} style={{ padding: 0, color: '#1890ff' }}>
                  Clear filters
                </Button>
                <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>
                  {filteredCount} of {totalCount} tickets
                </Text>
              </>
            )}
          </Space>
        </div>
      )}
      {collapsed && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Tooltip title="Show filters">
            <Badge count={hasActiveFilters ? filteredCount : 0} size="small" overflowCount={999}>
              <Button
                type="text"
                icon={<FilterOutlined />}
                onClick={() => onCollapsedChange(false)}
                style={{ color: 'rgba(255,255,255,0.85)' }}
              />
            </Badge>
          </Tooltip>
        </div>
      )}
    </Sider>
  )
}
