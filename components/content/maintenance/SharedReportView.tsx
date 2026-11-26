'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react'

import LinkedNote from '@/components/content/maintenance/LinkedNote'

export type ViewItem = { id: string; label: string; status: string | null; kind: 'ok' | 'issue' | 'na' | 'none'; note: string; checkedOn: string | null }
export type ViewSection = { name: string; items: ViewItem[] }
export type ViewShot = { title: string; home: boolean; desktop: string | null; mobile: string | null }
export type ViewData = {
  branding: { title: string; subtitle: string; headerImageUrl: string; footerText: string; footerImageUrl: string; colorPrimary: string; colorSection: string }
  meta: { company: string; website: string; date: string; developer: string | null; wp: string | null; php: string | null }
  sections: ViewSection[]
  shots: ViewShot[]
  conclusion: string
}

const ICON: Record<ViewItem['kind'], string> = { ok: '✓', issue: '!', na: '–', none: '·' }

/** The shared report as a web page: a summary first, the checks, then the pictures to look at right here, then the developer's comments. */
export default function SharedReportView({ data }: { data: ViewData }) {
  const { branding, meta, sections, shots, conclusion } = data
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)

  const counts = useMemo(() => {
    const c = { ok: 0, issue: 0, na: 0, none: 0 }
    for (const s of sections) for (const i of s.items) c[i.kind]++
    return c
  }, [sections])
  const total = counts.ok + counts.issue + counts.na + counts.none

  // Every picture in one list, so the viewer can step through them.
  const gallery = useMemo(() => {
    const out: { url: string; label: string }[] = []
    for (const s of shots) {
      if (s.desktop) out.push({ url: s.desktop, label: `${s.title} · Desktop` })
      if (s.mobile) out.push({ url: s.mobile, label: `${s.title} · Mobile` })
    }
    return out
  }, [shots])
  const indexOf = (url: string | null) => (url ? gallery.findIndex((g) => g.url === url) : -1)

  const step = useCallback((d: 1 | -1) => setViewer((v) => (v === null ? v : (v + d + gallery.length) % gallery.length)), [gallery.length])
  useEffect(() => {
    if (viewer === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null)
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [viewer, step])

  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%')

  return (
    <div className="sr">
      <style>{`
        .sr { --primary: ${branding.colorPrimary}; --section: ${branding.colorSection}; --ink: #1d2230; --muted: #667085; --line: #e6e8ef; --ok: #17803d; --bad: #c0292b;
          min-height: 100vh; background: #f6f7fb; color: var(--ink); color-scheme: light; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
        .sr * { box-sizing: border-box; }
        .sr a { color: var(--primary); }
        .sr-top { background: var(--primary); color: #fff; padding: 28px clamp(16px, 4vw, 56px) 24px; }
        .sr-top-in { max-width: 1600px; margin: 0 auto; display: flex; gap: 20px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
        .sr-brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
        .sr-logo { width: 56px; height: 56px; border-radius: 12px; background: #fff; padding: 6px; object-fit: contain; flex: none; }
        .sr-top h1 { margin: 0; font-size: clamp(20px, 3vw, 30px); line-height: 1.15; text-wrap: balance; }
        .sr-sub { margin-top: 4px; opacity: .9; font-size: 14px; white-space: pre-wrap; }
        .sr-btn { border: 1px solid rgba(255,255,255,.7); background: transparent; color: #fff; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; }
        .sr-btn:hover { background: rgba(255,255,255,.14); }
        .sr-wrap { max-width: 1600px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 56px); }
        .sr-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 28px; padding: 18px 0 6px; }
        .sr-meta div span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
        .sr-meta div b { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
        .sr-card { background: #fff; border: 1px solid var(--line); border-radius: 12px; }
        .sr-sum { padding: 20px 24px; margin-top: 14px; display: grid; gap: 14px; }
        .sr-sum-row { display: flex; flex-wrap: wrap; gap: 8px 36px; align-items: baseline; }
        .sr-big { font-size: 34px; font-weight: 700; line-height: 1; }
        .sr-big small { font-size: 14px; font-weight: 500; color: var(--muted); margin-left: 6px; }
        .sr-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: var(--line); }
        .sr-bar i { display: block; height: 100%; }
        .sr-nav { position: sticky; top: 0; z-index: 5; background: rgba(246,247,251,.94); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); margin-top: 18px; }
        .sr-nav-in { max-width: 1600px; margin: 0 auto; padding: 10px clamp(16px, 4vw, 56px); display: flex; gap: 6px 18px; flex-wrap: wrap; align-items: center; font-size: 13px; }
        .sr-nav a { text-decoration: none; color: var(--ink); padding: 4px 0; border-bottom: 2px solid transparent; }
        .sr-nav a:hover { border-bottom-color: var(--primary); }
        .sr-nav label { margin-left: auto; color: var(--muted); display: flex; gap: 6px; align-items: center; cursor: pointer; }
        .sr h2 { font-size: 18px; margin: 0 0 12px; }
        .sr-block { padding: 28px 0 4px; scroll-margin-top: 56px; }
        .sr-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 16px; align-items: start; }
        .sr-sec-h { padding: 12px 18px; background: var(--section); font-weight: 700; font-size: 14px; border-radius: 12px 12px 0 0; }
        .sr-item { display: grid; grid-template-columns: 26px 1fr auto; gap: 4px 12px; padding: 11px 18px; border-top: 1px solid var(--line); align-items: start; }
        .sr-item:first-of-type { border-top: 0; }
        .sr-ico { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; margin-top: 1px; }
        .sr-ico.ok { background: var(--ok); } .sr-ico.issue { background: var(--bad); } .sr-ico.na { background: #98a2b3; } .sr-ico.none { background: #d0d5dd; }
        .sr-label { font-size: 14px; text-wrap: pretty; }
        .sr-status { font-size: 13px; font-weight: 600; margin-top: 2px; }
        .sr-status.ok { color: var(--ok); } .sr-status.issue { color: var(--bad); } .sr-status.na, .sr-status.none { color: var(--muted); font-weight: 500; }
        .sr-note { font-size: 12.5px; color: var(--muted); margin-top: 3px; overflow-wrap: break-word; text-wrap: pretty; }
        .sr-date { font-size: 12px; color: var(--muted); white-space: nowrap; }
        .sr-shots { display: grid; gap: 18px; }
        .sr-shot { padding: 18px 20px; display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 1fr); gap: 20px; align-items: start; }
        .sr-shot h3 { grid-column: 1 / -1; margin: 0; font-size: 15px; }
        .sr-shot h3 span { font-weight: 400; color: var(--muted); font-size: 12px; margin-left: 8px; }
        .sr-frame { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #fff; cursor: zoom-in; position: relative; }
        .sr-frame .chrome { height: 24px; background: #eceef4; display: flex; align-items: center; gap: 5px; padding: 0 10px; }
        .sr-frame .chrome i { width: 8px; height: 8px; border-radius: 50%; background: #c3c8d4; display: block; }
        .sr-frame .pic { height: 320px; overflow: hidden; position: relative; }
        .sr-frame .pic img { width: 100%; display: block; }
        .sr-frame .pic::after { content: ''; position: absolute; inset: auto 0 0 0; height: 56px; background: linear-gradient(transparent, rgba(255,255,255,.92)); }
        .sr-frame .zoom { position: absolute; right: 10px; bottom: 10px; z-index: 1; font-size: 12px; background: var(--primary); color: #fff; border-radius: 999px; padding: 4px 12px; }
        .sr-frame.mobile { border-radius: 22px; border-width: 5px; border-color: #2b3040; max-width: 190px; margin: 0 auto; }
        .sr-frame.mobile .pic { height: 320px; }
        .sr-frame.mobile .chrome { display: none; }
        .sr-cap { font-size: 12px; color: var(--muted); margin: 6px 2px 0; text-align: center; }
        .sr-comments { padding: 20px 24px; white-space: pre-wrap; line-height: 1.6; font-size: 15px; }
        .sr-foot { margin-top: 36px; background: var(--primary); color: #fff; text-align: center; padding: 26px 16px; font-weight: 600; }
        .sr-foot img { display: block; max-width: min(100%, 900px); max-height: 140px; margin: 0 auto 10px; object-fit: contain; }
        .sr-vw { position: fixed; inset: 0; z-index: 50; background: rgba(15, 18, 28, .92); display: flex; flex-direction: column; }
        .sr-vw-bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 18px; color: #fff; font-size: 14px; }
        .sr-vw-bar button { background: rgba(255,255,255,.14); color: #fff; border: 0; border-radius: 8px; padding: 7px 14px; cursor: pointer; font-size: 14px; }
        .sr-vw-bar button:hover { background: rgba(255,255,255,.26); }
        .sr-vw-body { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 0 12px 24px; }
        .sr-vw-body img { width: min(100%, 1400px); height: auto; align-self: flex-start; background: #fff; border-radius: 6px; }
        .sr-vw-body img.mob { width: min(100%, 460px); }
        @media (max-width: 760px) { .sr-shot { grid-template-columns: 1fr; } .sr-nav label { margin-left: 0; } .sr-item { grid-template-columns: 26px 1fr; } .sr-date { grid-column: 2; } }
      `}</style>

      <header className="sr-top">
        <div className="sr-top-in">
          <div className="sr-brand">
            <img className="sr-logo" src={branding.headerImageUrl} alt="" />
            <div>
              <h1>{branding.title}</h1>
              {branding.subtitle ? <div className="sr-sub">{branding.subtitle}</div> : null}
            </div>
          </div>
          <button type="button" className="sr-btn" onClick={() => window.print()}>
            Save as PDF
          </button>
        </div>
      </header>

      <div className="sr-wrap">
        <div className="sr-meta">
          <div><span>Customer</span><b>{meta.company}</b></div>
          <div><span>Website</span><b>{meta.website}</b></div>
          <div><span>Maintenance date</span><b>{meta.date}</b></div>
          <div><span>Developer</span><b>{meta.developer ?? '—'}</b></div>
          <div><span>WordPress</span><b>{meta.wp ?? '—'}</b></div>
          <div><span>PHP</span><b>{meta.php ?? '—'}</b></div>
        </div>

        <div className="sr-card sr-sum">
          <div className="sr-sum-row">
            <div className="sr-big" style={{ color: 'var(--ok)' }}>{counts.ok}<small>checks passed</small></div>
            <div className="sr-big" style={{ color: counts.issue ? 'var(--bad)' : 'var(--muted)' }}>{counts.issue}<small>need attention</small></div>
            <div className="sr-big" style={{ color: 'var(--muted)' }}>{counts.na + counts.none}<small>not applicable or not checked</small></div>
          </div>
          <div className="sr-bar" aria-hidden>
            <i style={{ width: pct(counts.ok), background: 'var(--ok)' }} />
            <i style={{ width: pct(counts.issue), background: 'var(--bad)' }} />
            <i style={{ width: pct(counts.na), background: '#98a2b3' }} />
          </div>
        </div>
      </div>

      <nav className="sr-nav">
        <div className="sr-nav-in">
          <a href="#checks">Checks</a>
          {shots.length > 0 ? <a href="#pictures">Pictures</a> : null}
          <a href="#comments">Comments</a>
          <label>
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only what needs attention
          </label>
        </div>
      </nav>

      <div className="sr-wrap">
        <section className="sr-block" id="checks">
          <h2>Checks</h2>
          <div className="sr-grid">
            {sections.map((sec, si) => {
              const rows = onlyIssues ? sec.items.filter((i) => i.kind === 'issue') : sec.items
              if (rows.length === 0) return null
              return (
                <div key={sec.name} className="sr-card">
                  <div className="sr-sec-h">{String.fromCharCode(65 + si)}. {sec.name}</div>
                  {rows.map((it) => (
                    <div key={it.id} className="sr-item">
                      <div className={`sr-ico ${it.kind}`} aria-hidden>{ICON[it.kind]}</div>
                      <div>
                        <div className="sr-label">{it.label}</div>
                        <div className={`sr-status ${it.kind}`}>{it.status ?? 'Not checked'}</div>
                        {it.note ? <div className="sr-note"><LinkedNote text={it.note} /></div> : null}
                      </div>
                      <div className="sr-date">{it.checkedOn ?? ''}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {onlyIssues && counts.issue === 0 ? <p style={{ color: 'var(--muted)' }}>Nothing needs attention.</p> : null}
        </section>

        {shots.length > 0 ? (
          <section className="sr-block" id="pictures">
            <h2>Pictures of the website</h2>
            <div className="sr-shots">
              {shots.map((s) => (
                <div key={s.title + (s.home ? '-home' : '')} className="sr-card sr-shot">
                  <h3>{s.title}<span>click a picture to look closer</span></h3>
                  <div>
                    {s.desktop ? (
                      <>
                        <div className="sr-frame" onClick={() => setViewer(indexOf(s.desktop))} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setViewer(indexOf(s.desktop))}>
                          <div className="chrome"><i /><i /><i /></div>
                          <div className="pic"><img src={s.desktop} alt={`${s.title} on desktop`} loading="lazy" /></div>
                          <span className="zoom">View full page</span>
                        </div>
                        <div className="sr-cap">Desktop</div>
                      </>
                    ) : <div className="sr-cap">No desktop picture</div>}
                  </div>
                  <div>
                    {s.mobile ? (
                      <>
                        <div className="sr-frame mobile" onClick={() => setViewer(indexOf(s.mobile))} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setViewer(indexOf(s.mobile))}>
                          <div className="chrome" />
                          <div className="pic"><img src={s.mobile} alt={`${s.title} on mobile`} loading="lazy" /></div>
                        </div>
                        <div className="sr-cap">Mobile</div>
                      </>
                    ) : <div className="sr-cap">No mobile picture</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="sr-block" id="comments">
          <h2>Comments from the developer</h2>
          <div className="sr-card sr-comments">{conclusion || 'No comments.'}</div>
        </section>
      </div>

      {branding.footerImageUrl || branding.footerText ? (
        <footer className="sr-foot">
          {branding.footerImageUrl ? <img src={branding.footerImageUrl} alt="" /> : null}
          {branding.footerText ? <div style={{ whiteSpace: 'pre-wrap' }}>{branding.footerText}</div> : null}
        </footer>
      ) : <div style={{ height: 36 }} />}

      {viewer !== null && gallery[viewer] ? (
        <div className="sr-vw" role="dialog" aria-modal="true" aria-label={gallery[viewer].label} onClick={() => setViewer(null)}>
          <div className="sr-vw-bar" onClick={(e) => e.stopPropagation()}>
            <span>{gallery[viewer].label} <span style={{ opacity: 0.6 }}>({viewer + 1} of {gallery.length})</span></span>
            <span style={{ display: 'flex', gap: 8 }}>
              {gallery.length > 1 ? <button type="button" onClick={() => step(-1)}>Previous</button> : null}
              {gallery.length > 1 ? <button type="button" onClick={() => step(1)}>Next</button> : null}
              <button type="button" onClick={() => setViewer(null)}>Close</button>
            </span>
          </div>
          <div className="sr-vw-body">
            <img className={gallery[viewer].label.endsWith('Mobile') ? 'mob' : undefined} src={gallery[viewer].url} alt={gallery[viewer].label} onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
