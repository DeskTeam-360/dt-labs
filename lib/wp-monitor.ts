/** The form a WordPress site address is stored and looked up in: lowercase, no trailing slash. */
export function normaliseSiteUrl(url: string) {
  return url.trim().toLowerCase().replace(/\/+$/, '')
}

/**
 * What two addresses of the same site have in common, so a website listed under a company ("https://www.situs.org/")
 * finds its registered WordPress site ("https://situs.org"): no protocol, no leading www, no trailing slash, lowercase.
 */
export function siteMatchKey(url: string) {
  return normaliseSiteUrl(url).replace(/^https?:\/\//, '').replace(/^www\./, '')
}
