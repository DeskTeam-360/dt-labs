'use client'

import { useEffect, useState } from 'react'

interface DateDisplayProps {
  date: string | null | undefined
  format?: 'default' | 'detailed' | 'date-only'
}

export default function DateDisplay({ date, format = 'default' }: DateDisplayProps) {
  const [formattedDate, setFormattedDate] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    if (!date) {
      setFormattedDate('N/A')
      return
    }

    try {
      const dateObj = new Date(date)
      if (isNaN(dateObj.getTime())) {
        setFormattedDate('N/A')
        return
      }

      let formatted: string
      switch (format) {
        case 'detailed':
          formatted = dateObj.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
          break
        case 'date-only':
          formatted = dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
          break
        default:
          formatted = dateObj.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
      }
      setFormattedDate(formatted)
    } catch {
      setFormattedDate('N/A')
    }
  }, [date, format, mounted])

  // Show a simple fallback on initial server render to avoid hydration mismatch
  if (!mounted || formattedDate === null) {
    return <span suppressHydrationWarning>{date ? date.split('T')[0] : 'N/A'}</span>
  }

  return <span suppressHydrationWarning>{formattedDate}</span>
}

