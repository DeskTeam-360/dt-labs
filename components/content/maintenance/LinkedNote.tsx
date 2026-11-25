import { cleanPageTitle } from '@/lib/page-title'

const urlRe = /(https?:\/\/\S+)/

/**
 * A note as readable text. A line "Title: https://..." becomes the title as a link; a line that is only an address becomes `fallbackLabel`
 * (or the address when there is none). Words are never cut in the middle: only an address too long for the line may break.
 */
export default function LinkedNote({ text, fallbackLabel }: { text: string; fallbackLabel?: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const m = /^(.*?):?\s*(https?:\/\/\S+)\s*$/.exec(line.trim())
        if (m) {
          const label = m[1].trim() ? cleanPageTitle(m[1]) : (fallbackLabel ?? m[2])
          return (
            <div key={i}>
              <a href={m[2]} target="_blank" rel="noopener noreferrer nofollow" style={{ overflowWrap: 'anywhere' }}>
                {label}
              </a>
            </div>
          )
        }
        return (
          <div key={i}>
            {line.split(urlRe).map((part, j) =>
              /^https?:\/\//.test(part) ? (
                <a key={j} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ overflowWrap: 'anywhere' }}>
                  {part}
                </a>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </div>
        )
      })}
    </>
  )
}
