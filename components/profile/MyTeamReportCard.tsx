'use client'

import { BarChartOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, DatePicker, Flex, message, Progress, Row, Select, Space, Switch, Tag, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import { fmtH, pctColor, type Person, PersonDetail, type Report } from '@/components/content/customer/TeamReportContent'
import {
  CUSTOMER_TIME_REPORT_DATE_PRESET_OPTIONS,
  type CustomerTimeReportDatePresetKey,
  resolveDatePresetToRange,
} from '@/lib/customer-time-report-defaults'

const { Text } = Typography
const { RangePicker } = DatePicker

/** Profile section: the signed-in user's own utilization (same numbers as Team Report, own row only). */
export default function MyTeamReportCard() {
  const [preset, setPreset] = useState<CustomerTimeReportDatePresetKey | undefined>('this_month')
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => {
    const r = resolveDatePresetToRange('this_month', dayjs())
    return r ? [r.start, r.end] : null
  })
  const [customerOnly, setCustomerOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const load = useCallback(
    async (presetKey: CustomerTimeReportDatePresetKey | undefined, r: [Dayjs, Dayjs] | null, custOnly: boolean) => {
      let useRange = r
      if (presetKey) {
        const pr = resolveDatePresetToRange(presetKey, dayjs())
        if (pr) useRange = [pr.start, pr.end]
      }
      if (!useRange) {
        message.warning('Pick a date range')
        return
      }
      setLoading(true)
      try {
        const qs = new URLSearchParams({ mine: '1', start: useRange[0].format('YYYY-MM-DD'), end: useRange[1].format('YYYY-MM-DD') })
        if (custOnly) qs.set('customer_only', '1')
        const res = await fetch(`/api/reports/team-utilization?${qs.toString()}`, { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText)
        setReport(data as Report)
      } catch (e) {
        message.error((e as Error).message)
        setReport(null)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load('this_month', null, false)
  }, [load])

  const me: Person | undefined = report?.people[0]

  return (
    <Card
      style={{ marginTop: 24 }}
      title={
        <Space>
          <BarChartOutlined />
          <span>My Team Report</span>
        </Space>
      }
    >
      <Flex gap={12} wrap="wrap" align="center" style={{ marginBottom: 16 }}>
        <Select<CustomerTimeReportDatePresetKey>
          allowClear
          placeholder="Custom range"
          style={{ width: 200 }}
          value={preset}
          options={CUSTOMER_TIME_REPORT_DATE_PRESET_OPTIONS}
          onChange={(v) => {
            setPreset(v)
            if (v) {
              const r = resolveDatePresetToRange(v, dayjs())
              if (r) setRange([r.start, r.end])
            }
          }}
        />
        <RangePicker
          value={range}
          format="MMM DD, YYYY"
          onChange={(v) => {
            setPreset(undefined)
            setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)
          }}
        />
        <Space size={6}>
          <Switch checked={customerOnly} onChange={setCustomerOnly} />
          <Text>Customer only</Text>
        </Space>
        <Button type="primary" loading={loading} onClick={() => void load(preset, range, customerOnly)}>
          Load report
        </Button>
      </Flex>

      {report?.future_range ? (
        <Alert type="info" showIcon title="That date range is still in the future — nothing to report yet." />
      ) : me ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={[16, 16]}>
            {[
              { label: 'Capacity', value: fmtH(me.capacity_hours) },
              { label: report?.customer_only ? 'Worked (customer)' : 'Worked', value: fmtH(me.worked_hours) },
              { label: 'Free time', value: fmtH(me.free_hours) },
              { label: 'Loose days', value: me.loose_days },
              { label: 'Idle days', value: me.idle_days },
              { label: 'Overtime', value: me.overtime_hours > 0 ? fmtH(me.overtime_hours) : '—' },
            ].map((m) => (
              <Col xs={12} sm={8} lg={4} key={m.label}>
                <Card size="small">
                  <Text type="secondary" style={{ fontSize: 12 }}>{m.label}</Text>
                  <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                </Card>
              </Col>
            ))}
          </Row>
          <Flex align="center" gap={12}>
            <Text strong>Utilization</Text>
            {me.utilization_pct == null ? (
              <Text type="secondary">No capacity in this range</Text>
            ) : (
              <>
                <Progress percent={Math.min(100, me.utilization_pct)} showInfo={false} size="small" status={me.utilization_pct > 100 ? 'exception' : 'normal'} style={{ width: 220, margin: 0 }} />
                <Tag color={pctColor(me.utilization_pct)} style={{ margin: 0 }}>{me.utilization_pct}%</Tag>
              </>
            )}
          </Flex>
          {report?.clipped_to_today ? (
            <Text type="secondary" style={{ fontSize: 12 }}>The range ends in the future, so the report stops at today ({report.end}).</Text>
          ) : null}
          <PersonDetail p={me} minFree={report?.loose_day_min_free_hours ?? 2} />
        </Space>
      ) : (
        <Text type="secondary">{loading ? 'Loading…' : 'No data for this range.'}</Text>
      )}
    </Card>
  )
}
