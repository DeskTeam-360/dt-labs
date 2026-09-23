import { notFound } from 'next/navigation'

import { getMobileSession, getMobileTicketDetail } from '../../_data'
import DetailClient from './_DetailClient'

interface Props { params: Promise<{ id: string }> }

export default async function MobileTicketDetail({ params }: Props) {
  const { id } = await params
  const [user, ticket] = await Promise.all([
    getMobileSession(),
    getMobileTicketDetail(Number(id)),
  ])

  if (!ticket) notFound()

  const isCustomer = user?.role?.toLowerCase() === 'customer'

  return <DetailClient ticket={ticket} isCustomer={isCustomer} />
}
