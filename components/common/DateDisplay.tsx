'use client'

import { useEffect, useState } from 'react'

interface DateDisplayProps {
  date: string | null | undefined
  format?: 'default' | 'detailed' | 'date-only' | 'relative'
}

function timeAgo(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${diff} second${diff !== 1 ? 's' : ''} ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
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
        case 'relative': {
          const abs = dateObj.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
          formatted = `${timeAgo(dateObj)} (${abs})`
          break
        }
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

