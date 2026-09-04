'use client'

import { useEffect, useState } from 'react'

interface TrackerElapsedProps {
  totalTimeSeconds: number
  activeTimeTracker: { start_time: string } | null | undefined
  formatTime: (seconds: number) => string
}

export default function TrackerElapsed({ totalTimeSeconds, activeTimeTracker, formatTime }: TrackerElapsedProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!activeTimeTracker) {
      setElapsed(0)
      return
    }
    const calc = () =>
      Math.floor((Date.now() - new Date(activeTimeTracker.start_time).getTime()) / 1000)
    setElapsed(calc())
    const id = window.setInterval(() => setElapsed(calc()), 1000)
    return () => window.clearInterval(id)
  }, [activeTimeTracker])

  return <>{formatTime(totalTimeSeconds + elapsed)}</>
}
