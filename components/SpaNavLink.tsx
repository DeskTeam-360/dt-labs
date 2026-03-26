'use client'

import { useRouter } from 'next/navigation'
import type {
  AnchorHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'

/** Mouse click or keyboard activation (e.g. Ant Design Menu `domEvent`). */
export type OpenInNewTabGesture =
  | Pick<ReactMouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'button'>
  | Pick<ReactKeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>

/** True when the browser should handle navigation (new tab / window). */
export function shouldOpenHrefInNewTab(e: OpenInNewTabGesture) {
  const modifier = !!(e.ctrlKey || e.metaKey || e.shiftKey)
  if ('button' in e && typeof e.button === 'number') {
    return modifier || e.button === 1
  }
  return modifier
}

/**
 * Renders a real anchor with href so Open in new tab, middle-click, and Ctrl/Cmd/Shift+click work.
 * Plain left click uses client-side navigation.
 */
export function SpaNavLink({
  href,
  children,
  className,
  onClick,
  ...rest
}: { href: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const router = useRouter()
  return (
    <a
      href={href}
      className={className}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        if (shouldOpenHrefInNewTab(e)) return
        if (e.button !== 0) return
        e.preventDefault()
        router.push(href)
      }}
    >
      {children}
    </a>
  )
}
