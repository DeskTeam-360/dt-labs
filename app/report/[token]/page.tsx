import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import PrintButton from '@/components/content/maintenance/PrintButton'
import { isPrivateNote, loadSharedMaintenanceReport } from '@/lib/maintenance-report'

export const dynamic = 'force-dynamic'

// A shared report is for the customer only: keep it out of search engines.
export const metadata: Metadata = { title: 'Website maintenance report', robots: { index: false, follow: false } }

const urlPattern = /(https?:\/\/[^\s]+)/g

function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <div key={i} style={{ wordBreak: 'break-all' }}>
          {line.split(urlPattern).map((part, j) =>
            /^https?:\/\//.test(part) ? (
              <a key={j} href={part} target="_blank" rel="noopener noreferrer nofollow">
                {part.length > 70 ? `${part.slice(0, 67)}...` : part}
              </a>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
        </div>
      ))}
    </>
  )
}

export default async function SharedMaintenanceReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await loadSharedMaintenanceReport(token)
  if (!data) notFound()
  const { report, header, items } = data

  const sections: { name: string; items: typeof items }[] = []
  for (const i of items) {
    const last = sections[sections.length - 1]
    if (last && last.name === i.section) last.items.push(i)
    else sections.push({ name: i.section, items: [i] })
  }

  return (
    <main className="report">
      <style>{`
        .report { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2430; }
        .report h1 { font-size: 22px; margin: 0 0 4px; }
        .report .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px 24px; margin: 16px 0 24px; font-size: 14px; }
        .report .meta b { display: inline-block; min-width: 120px; color: #5b6070; font-weight: 500; }
        .report section { margin-bottom: 20px; border: 1px solid #e3e5ec; border-radius: 6px; overflow: hidden; }
        .report h2 { margin: 0; padding: 8px 12px; font-size: 14px; background: #ece9f7; }
        .report table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .report th { text-align: left; padding: 6px 12px; color: #5b6070; font-weight: 500; border-bottom: 1px solid #e3e5ec; }
        .report td { padding: 7px 12px; vertical-align: top; border-top: 1px solid #eef0f5; }
        .report .scroll { overflow-x: auto; }
        .report .ok { color: #137333; font-weight: 500; }
        .report .issue { color: #b3261e; font-weight: 500; }
        .report .conclusion { white-space: pre-wrap; padding: 12px; font-size: 14px; line-height: 1.5; }
        .report .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
        .report footer { margin-top: 28px; text-align: center; color: #8a8fa0; font-size: 12px; }
        @media print { .no-print { display: none !important; } .report { padding: 0; } .report section { break-inside: avoid; } }
        @media (prefers-color-scheme: dark) {
          body { background: #14161c; }
          .report { color: #e6e8ee; }
          .report section { border-color: #2b2f3a; }
          .report h2 { background: #2a2540; }
          .report th { color: #a3a8b8; border-color: #2b2f3a; }
          .report td { border-color: #232733; }
          .report .meta b { color: #a3a8b8; }
          .report .ok { color: #6fd08c; }
          .report .issue { color: #ff8a80; }
          .report a { color: #8ab4f8; }
        }
      `}</style>

      <div className="bar">
        <h1>{report.templateName}</h1>
        <span className="no-print">
          <PrintButton />
        </span>
      </div>
      <div className="meta">
        <div><b>Customer</b>{header.company_name}</div>
        <div><b>Maintenance date</b>{report.periodDate}</div>
        <div><b>Website</b>{header.website_url}</div>
        <div><b>Developer</b>{header.developer ?? '—'}</div>
        <div><b>WordPress version</b>{header.wp_version ?? '—'}</div>
        <div><b>PHP version</b>{header.php_version ?? '—'}</div>
      </div>

      {sections.map((sec, si) => (
        <section key={sec.name}>
          <h2>{String.fromCharCode(65 + si)}. {sec.name}</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr><th style={{ width: 36 }}>No</th><th>Item</th><th style={{ width: 100 }}>Date</th><th style={{ width: 240 }}>Status</th><th>Note</th></tr>
              </thead>
              <tbody>
                {sec.items.map((it, n) => {
                  const good = it.status !== null && it.status === it.options[0]
                  const issue = it.status !== null && it.options.slice(1).includes(it.status)
                  const note = isPrivateNote(it) ? '' : [it.note ?? '', it.linkUrl && !(it.note ?? '').includes(it.linkUrl) ? it.linkUrl : ''].filter(Boolean).join('\n')
                  return (
                    <tr key={it.id}>
                      <td>{n + 1}</td>
                      <td>{it.label}</td>
                      <td>{it.checkedOn ?? '—'}</td>
                      <td className={good ? 'ok' : issue ? 'issue' : undefined}>{it.status ?? '—'}</td>
                      <td>{note ? <Linked text={note} /> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <h2>Comments from developer</h2>
        <div className="conclusion">{report.conclusion || '—'}</div>
      </section>

      <footer>DeskTeam360</footer>
    </main>
  )
}
