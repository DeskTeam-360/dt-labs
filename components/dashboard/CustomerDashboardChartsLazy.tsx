'use client'

import { Spin } from 'antd'
import dynamic from 'next/dynamic'

const spin = <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>

export const LazyCustomerDashboardBarBlock = dynamic(
  () =>
    import('./CustomerDashboardCharts').then((m) => ({
      default: m.CustomerDashboardBarBlock,
    })),
  { ssr: false, loading: () => spin }
)

export const LazyCustomerDashboardDonutBlock = dynamic(
  () =>
    import('./CustomerDashboardCharts').then((m) => ({
      default: m.CustomerDashboardDonutBlock,
    })),
  { ssr: false, loading: () => spin }
)
