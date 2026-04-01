'use client'

import dynamic from 'next/dynamic'
import type { TicketDetailContentProps } from './TicketDetailContent'

/** `ssr: false` must live in a Client Component (Next.js 16). Avoids NP extension hydration noise on inputs. */
const TicketDetailContent = dynamic(() => import('./TicketDetailContent'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 48, textAlign: 'center', color: 'rgba(0,0,0,0.45)' }}>Loading ticket…</div>
  ),
})

export default function TicketDetailContentClient(props: TicketDetailContentProps) {
  return <TicketDetailContent {...props} />
}
