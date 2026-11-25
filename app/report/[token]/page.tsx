import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import LinkedNote from '@/components/content/maintenance/LinkedNote'
import PrintButton from '@/components/content/maintenance/PrintButton'
import { isPrivateNote, loadSharedMaintenanceReport } from '@/lib/maintenance-report'

export const dynamic = 'force-dynamic'

// A shared report is for the customer only: keep it out of search engines.
export const metadata: Metadata = { title: 'Website maintenance report', robots: { index: false, follow: false }, other: { 'color-scheme': 'light' } }

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
    <div className="report-page">
    <main className="report">
      <style>{`
        .report { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2430; background: #fff; color-scheme: light; }
        .report-page { min-height: 100vh; background: #fff; color-scheme: light; }
        .report h1 { font-size: 22px; margin: 0; }
        .report .brand { display: flex; align-items: center; gap: 12px; }
        .report .brand img { width: 40px; height: 40px; object-fit: contain; }
        .report td, .report th, .report .meta div { text-wrap: pretty; overflow-wrap: break-word; word-break: normal; }
        .report td:nth-child(2) { min-width: 220px; }
        .report td:nth-child(5) { min-width: 260px; }
        .report td:nth-child(3) { white-space: nowrap; }
        .report .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px 24px; margin: 16px 0 24px; font-size: 14px; }
        .report .meta b { display: inline-block; min-width: 120px; color: #5b6070; font-weight: 500; }
        .report section { margin-bottom: 20px; border: 1px solid #d9d0ee; overflow: hidden; }
        .report h2 { margin: 0; padding: 8px 12px; font-size: 14px; font-weight: 700; background: #cdc1ee; color: #1f1f2e; }
        .report h2.magenta { background: #cc1068; color: #fff; }
        .report table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .report th { text-align: center; padding: 9px 12px; color: #fff; background: #cc1068; font-weight: 700; }
        .report td { padding: 7px 12px; vertical-align: top; border-top: 1px solid #eef0f5; }
        .report .scroll { overflow-x: auto; }
        .report .ok { color: #1f2430; }
        .report .issue { color: #b3261e; font-weight: 500; }
        .report .conclusion { white-space: pre-wrap; padding: 12px; font-size: 14px; line-height: 1.5; }
        .report .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
        .report-footer { margin-top: 28px; padding: 22px 16px; text-align: center; color: #fff; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; background: linear-gradient(90deg, #d4146e, #e2127f 50%, #d4146e); }
        .report td:nth-child(4), .report td:nth-child(3), .report td:first-child { text-align: center; }
        @media print { .no-print { display: none !important; } .report { padding: 0; } .report section { break-inside: avoid; } }
      `}</style>

      <div className="bar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="DeskTeam360" />
          <h1>{report.templateName}</h1>
        </div>
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
                      <td>{note ? <LinkedNote text={note} fallbackLabel={it.source?.startsWith('shot_home') ? 'Homepage' : undefined} /> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <h2 className="magenta">Comments from the developer</h2>
        <div className="conclusion">{report.conclusion || '—'}</div>
      </section>

      <div className="report-footer">www.DeskTeam360.com</div>
    </main>
    </div>
  )
}
