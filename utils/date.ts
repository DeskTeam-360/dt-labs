/**
 * Format date string to locale string
 * This ensures consistent formatting between server and client
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A'
  
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'N/A'
    
    // Use ISO string format to ensure consistency
    // Or use a fixed locale and timezone
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC', // Use UTC to ensure consistency
    })
  } catch {
    return 'N/A'
  }
}

/**
 * Format date to date string only (no time)
 */
export function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A'
  
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'N/A'
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return 'N/A'
  }
}

/**
 * Format date to detailed locale string
 */
export function formatDateDetailed(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A'
  
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'N/A'
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    })
  } catch {
    return 'N/A'
  }
}

