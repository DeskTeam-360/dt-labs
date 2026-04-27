'use client'

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

type ChartRow = { day: string; short: string; duration: number; fullMark: number }

export default function DashboardStaffCharts({ chartData }: { chartData: ChartRow[] }) {
  return (
    <div style={{ width: '100%', height: 320, minHeight: 280, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={280}>
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="short" />
          <PolarRadiusAxis angle={90} domain={[0, 'auto']} tickFormatter={(v) => `${v}m`} />
          <Radar name="Minutes" dataKey="duration" stroke="#1890ff" fill="#1890ff" fillOpacity={0.4} />
          <Tooltip
            formatter={(value: number | undefined) => [`${value ?? 0} min`, 'Duration']}
            labelFormatter={(label) => chartData.find((d) => d.short === label)?.day ?? label}
          />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
