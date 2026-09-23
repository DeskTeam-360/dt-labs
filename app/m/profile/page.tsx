import { getMobileSession } from '../_data'
import ProfileClient from './_ProfileClient'

export default async function MobileProfile() {
  const user = await getMobileSession()
  return (
    <ProfileClient
      name={user?.name ?? ''}
      email={user?.email ?? ''}
      role={user?.role ?? 'Customer'}
    />
  )
}
