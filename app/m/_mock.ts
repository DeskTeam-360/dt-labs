export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
export type TicketStatus = string

export interface MockTicket {
  id: number
  title: string
  priority: Priority
  status: string
  statusColor: string
  company: string
  tags: { label: string; color: string }[]
  description: string
  createdAt: string
  assignee: string
}

export const MOCK_TICKETS: MockTicket[] = [
  {
    id: 202975,
    title: 'Login page is broken after update',
    priority: 'P1',
    status: "We're reviewing internally",
    statusColor: '#52c41a',
    company: 'Prodev Com',
    tags: [{ label: 'Intake Check', color: '#ff4d4f' }],
    description: 'After the latest deployment, users cannot log in. The page throws a 500 error on submit.',
    createdAt: '2024-09-20',
    assignee: 'Asif',
  },
  {
    id: 202939,
    title: 'This is a test ticket for title',
    priority: 'P2',
    status: "We're reviewing internally",
    statusColor: '#52c41a',
    company: 'Prodev Com',
    tags: [{ label: 'AI Direct', color: '#1677ff' }],
    description: 'Test ticket created for demonstration purposes.',
    createdAt: '2024-09-19',
    assignee: 'Dhea',
  },
  {
    id: 202974,
    title: 'TEst copy paste clipboard',
    priority: 'P3',
    status: 'Ready for your review',
    statusColor: '#fa8c16',
    company: 'Prodev Com',
    tags: [{ label: 'Design', color: '#eb2f96' }],
    description: 'Clipboard paste functionality not working in the rich text editor.',
    createdAt: '2024-09-18',
    assignee: 'Asif',
  },
  {
    id: 202076,
    title: 'Fwd: Something is wrong',
    priority: 'P4',
    status: 'Ready for your review',
    statusColor: '#fa8c16',
    company: 'Prodev Com',
    tags: [],
    description: 'Forwarded email from client about an unspecified issue with the dashboard.',
    createdAt: '2024-09-15',
    assignee: 'Dhea',
  },
  {
    id: 203096,
    title: 'Fwd: You now have exclusive access to AI features',
    priority: 'P5',
    status: 'Ticket received',
    statusColor: '#8c8c8c',
    company: 'Prodev Com',
    tags: [],
    description: 'Notification email forwarded about new AI feature access.',
    createdAt: '2024-09-10',
    assignee: 'Asif',
  },
]

export const PRIORITY_COLOR: Record<Priority, string> = {
  P1: '#ff4d4f',
  P2: '#fa8c16',
  P3: '#fadb14',
  P4: '#52c41a',
  P5: '#8c8c8c',
}

export const MOCK_STATS = {
  open: 12,
  inProgress: 5,
  resolved: 38,
  avgResponse: '2h 14m',
}
