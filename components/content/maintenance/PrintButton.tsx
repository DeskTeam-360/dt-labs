'use client'

/** Opens the print dialog (Save as PDF works from there). */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #c9ccd8', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13 }}
    >
      Print or save as PDF
    </button>
  )
}
