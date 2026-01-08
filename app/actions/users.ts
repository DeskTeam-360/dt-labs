'use server'

export async function createUser(formData: {
  email: string
  password: string
  full_name: string
  role: string
  status: string
}) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/users/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    })

    const data = await response.json()

    if (!response.ok) {
      return { error: data.error || 'Failed to create user' }
    }

    return { success: true, data: data.data }
  } catch (error: any) {
    return { error: error.message || 'Failed to create user' }
  }
}

