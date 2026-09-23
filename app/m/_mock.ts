export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
export type TicketStatus = string

export interface MockTicket {
  id: number
  title: string
  priority: Priority
  status: string
  statusColor: string
  statusGroup: 'open' | 'in_progress' | 'need_response' | 'completed'
  company: string
  tags: { label: string; color: string }[]
  description: string
  createdAt: string
  assignee: string
}

// Status groups matching actual system statuses
export const STATUS_GROUPS = {
  open: { label: 'Open', statuses: ['Ticket received', 'Open'] },
  in_progress: { label: 'In Progress', statuses: ["We're reviewing internally", 'On progress'] },
  need_response: { label: 'Need Your Response', statuses: ['Ready for your review', 'Client review', 'Question'] },
  completed: { label: 'Completed', statuses: ['Completed', 'Closed'] },
}

export const MOCK_TICKETS: MockTicket[] = [
  {
    id: 202975,
    title: 'Login page is broken after update',
    priority: 'P1',
    status: "We're reviewing internally",
    statusColor: '#52c41a',
    statusGroup: 'in_progress',
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
    statusGroup: 'in_progress',
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
    statusGroup: 'need_response',
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
    status: 'Ticket received',
    statusColor: '#8c8c8c',
    statusGroup: 'open',
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
    statusGroup: 'open',
    company: 'Prodev Com',
    tags: [],
    description: 'Notification email forwarded about new AI feature access.',
    createdAt: '2024-09-10',
    assignee: 'Asif',
  },
  {
    id: 201980,
    title: 'Dashboard chart not loading',
    priority: 'P2',
    status: 'Completed',
    statusColor: '#1677ff',
    statusGroup: 'completed',
    company: 'Prodev Com',
    tags: [{ label: 'Design', color: '#eb2f96' }],
    description: 'The analytics chart on the dashboard shows a blank white box instead of data.',
    createdAt: '2024-09-12',
    assignee: 'Asif',
  },
  {
    id: 201975,
    title: 'Export to PDF feature request',
    priority: 'P3',
    status: 'Completed',
    statusColor: '#1677ff',
    statusGroup: 'completed',
    company: 'Prodev Com',
    tags: [],
    description: 'Customer requested an export to PDF feature for their reports.',
    createdAt: '2024-09-11',
    assignee: 'Dhea',
  },
]

export interface MockComment {
  id: number
  author: string
  role: 'customer' | 'agent'
  body: string
  createdAt: string
  isNote?: boolean
}

export const MOCK_COMMENTS: MockComment[] = [
  { id: 1, author: 'Budi Santoso', role: 'customer', body: 'Selamat siang, saya tidak bisa login sejak tadi pagi. Sudah coba reset password tapi tetap error.', createdAt: '09:15' },
  { id: 2, author: 'Asif', role: 'agent', body: 'Halo Budi, terima kasih sudah menghubungi kami. Kami sedang investigasi masalah ini. Bisa tolong share screenshot error yang muncul?', createdAt: '09:32' },
  { id: 3, author: 'Asif', role: 'agent', body: 'Internal: Cek log server, ada kemungkinan session expired setelah deployment kemarin.', createdAt: '09:35', isNote: true },
  { id: 4, author: 'Budi Santoso', role: 'customer', body: 'Ini screenshotnya, errornya "500 Internal Server Error" saat klik tombol login.', createdAt: '09:48' },
  { id: 5, author: 'Dhea', role: 'agent', body: 'Sudah kami fix di backend, mohon coba login kembali sekarang ya Budi.', createdAt: '10:20' },
]

export const MOCK_STATS = {
  open: MOCK_TICKETS.filter((t) => t.statusGroup === 'open').length,
  inProgress: MOCK_TICKETS.filter((t) => t.statusGroup === 'in_progress').length,
  needResponse: MOCK_TICKETS.filter((t) => t.statusGroup === 'need_response').length,
  completedThisWeek: MOCK_TICKETS.filter((t) => t.statusGroup === 'completed').length,
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  P1: '#ff4d4f',
  P2: '#fa8c16',
  P3: '#fadb14',
  P4: '#52c41a',
  P5: '#8c8c8c',
}
