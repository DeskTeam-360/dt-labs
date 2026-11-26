import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import LinkedNote from '@/components/content/maintenance/LinkedNote'
import PrintButton from '@/components/content/maintenance/PrintButton'
import SharedReportView, { type ViewData, type ViewShot } from '@/components/content/maintenance/SharedReportView'
import { isPrivateNote, loadSharedMaintenanceReport } from '@/lib/maintenance-report'
import { cleanPageTitle } from '@/lib/page-title'

export const dynamic = 'force-dynamic'

// A shared report is for the customer only: keep it out of search engines.
export const metadata: Metadata = { title: 'Website maintenance report', robots: { index: false, follow: false }, other: { 'color-scheme': 'light' } }

export default async function SharedMaintenanceReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await loadSharedMaintenanceReport(token)
  if (!data) notFound()
  const { report, header, items, branding } = data

  const sections: { name: string; items: typeof items }[] = []
  for (const i of items) {
    const last = sections[sections.length - 1]
    if (last && last.name === i.section) last.items.push(i)
    else sections.push({ name: i.section, items: [i] })
  }

  // The web view: pictures are shown in the page itself, so their addresses leave the notes.
  const shotMap = new Map<string, ViewShot>()
  for (const it of items) {
    const m = /^shot_(home|inner)_(desktop|mobile)$/.exec(it.source ?? '')
    if (!m) continue
    const home = m[1] === 'home'
    for (const line of [it.note ?? '', it.linkUrl ?? ''].join('\n').split('\n')) {
      const x = /^(.*?):?\s*(https?:\/\/\S+)\s*$/.exec(line.trim())
      if (!x) continue
      const title = home ? 'Homepage' : cleanPageTitle(x[1] || '', x[2])
      const key = home ? '__home' : title
      const cur = shotMap.get(key) ?? { title, home, desktop: null, mobile: null }
      cur[m[2] as 'desktop' | 'mobile'] = cur[m[2] as 'desktop' | 'mobile'] ?? x[2]
      shotMap.set(key, cur)
    }
  }
  const shots = [...shotMap.values()].sort((a, b) => Number(b.home) - Number(a.home))
  const view: ViewData = {
    branding,
    meta: { company: header.company_name, website: header.website_url, date: report.periodDate, developer: header.developer, wp: header.wp_version, php: header.php_version },
    sections: sections.map((sec) => ({
      name: sec.name,
      items: sec.items.map((it) => ({
        id: it.id,
        label: it.label,
        status: it.status,
        kind: it.status === null ? 'none' : it.status === 'N/A' ? 'na' : it.status === it.options[0] ? 'ok' : it.options.slice(1).includes(it.status) ? 'issue' : 'ok',
        note: /^shot_/.test(it.source ?? '') || isPrivateNote(it) ? '' : [it.note ?? '', it.linkUrl && !(it.note ?? '').includes(it.linkUrl) ? it.linkUrl : ''].filter(Boolean).join('\n'),
        checkedOn: it.checkedOn,
      })),
    })),
    shots,
    conclusion: report.conclusion ?? '',
  }

  return (
    <>
    <style>{`@media screen { .print-only { display: none !important; } } @media print { .web-only { display: none !important; } }`}</style>
    <div className="web-only">
      <SharedReportView data={view} />
    </div>
    <div className="print-only">
    <div className="report-page" style={{ ['--primary' as string]: branding.colorPrimary, ['--section' as string]: branding.colorSection }}>
    <main className="report">
      <style>{`
        .report { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2430; background: #fff; color-scheme: light; }
        .report-page { min-height: 100vh; background: #fff; color-scheme: light; }
        .report h1 { font-size: 22px; margin: 0; }
        .report .brand { display: flex; align-items: center; gap: 12px; }
        .report .subtitle { font-size: 13px; color: #5b6070; margin-top: 2px; white-space: pre-wrap; }
        .report .footer-img { display: block; max-width: 100%; max-height: 120px; margin: 0 auto 8px; object-fit: contain; }
        .report .brand img { width: 40px; height: 40px; object-fit: contain; }
        .report td, .report th, .report .meta div { text-wrap: pretty; overflow-wrap: break-word; word-break: normal; }
        .report td:nth-child(2) { min-width: 220px; }
        .report td:nth-child(5) { min-width: 260px; }
        .report td:nth-child(3) { white-space: nowrap; }
        .report .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px 24px; margin: 16px 0 24px; font-size: 14px; }
        .report .meta b { display: inline-block; min-width: 120px; color: #5b6070; font-weight: 500; }
        .report section { margin-bottom: 0; border: 1px solid #d9d0ee; overflow: hidden; }
        .report section + section { border-top: 0; }
        .report h2 { margin: 0; padding: 8px 12px; font-size: 14px; font-weight: 700; background: var(--section); color: #1f1f2e; }
        .report h2.magenta { background: var(--primary); color: #fff; }
        .report table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .report th { text-align: center; padding: 9px 12px; color: #fff; background: var(--primary); font-weight: 700; }
        .report td { padding: 7px 12px; vertical-align: top; border-top: 1px solid #eef0f5; }
        .report .scroll { overflow-x: auto; }
        .report .ok { color: #1f2430; }
        .report .issue { color: #b3261e; font-weight: 500; }
        .report .conclusion { white-space: pre-wrap; padding: 12px; font-size: 14px; line-height: 1.5; }
        .report .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
        .report-footer { margin-top: 28px; padding: 22px 16px; text-align: center; color: #fff; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; background: var(--primary); }
        .report td:nth-child(4), .report td:nth-child(3), .report td:first-child { text-align: center; }
        @media print { .no-print { display: none !important; } .report { padding: 0; } .report section { break-inside: avoid; } }
      `}</style>

      <div className="bar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.headerImageUrl} alt="" />
          <div>
            <h1>{branding.title}</h1>
            {branding.subtitle ? <div className="subtitle">{branding.subtitle}</div> : null}
          </div>
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

      {branding.footerImageUrl || branding.footerText ? (
        <div className="report-footer">
          {branding.footerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.footerImageUrl} alt="" className="footer-img" />
          ) : null}
          {branding.footerText ? <div style={{ whiteSpace: 'pre-wrap' }}>{branding.footerText}</div> : null}
        </div>
      ) : null}
    </main>
    </div>
    </div>
    </>
  )
}
