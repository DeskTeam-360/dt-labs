/** Same-origin URL that forces the browser to download an attachment instead of opening it. */
export function attachmentDownloadHref(fileUrl: string, fileName?: string): string {
  const qs = new URLSearchParams({ url: fileUrl })
  if (fileName) qs.set('name', fileName)
  return `/api/attachments/download?${qs.toString()}`
}
