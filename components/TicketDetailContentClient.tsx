'use client'

import dynamic from 'next/dynamic'
import type { TicketDetailContentProps } from './content/TicketDetailContent'

/** `ssr: false` must live in a Client Component (Next.js 16). Avoids NP extension hydration noise on inputs. */
const TicketDetailContent = dynamic(() => import('./content/TicketDetailContent'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 48, textAlign: 'center', color: 'rgba(88, 67, 67, 0.45)' }}>Loading ticket…</div>
  ),
})

export default function TicketDetailContentClient(props: TicketDetailContentProps) {
  return <TicketDetailContent {...props} />
}
