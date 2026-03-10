import { defineConfig } from 'drizzle-kit'

// Strip ?schema=public from DATABASE_URL (postgres.js doesn't support it)
function getDbUrl() {
  const url = process.env.DATABASE_URL || ''
  const idx = url.indexOf('?')
  if (idx <= 0) return url
  const params = url.slice(idx + 1).split('&').filter((p) => !p.startsWith('schema='))
  return url.slice(0, idx) + (params.length ? '?' + params.join('&') : '')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: getDbUrl(),
  },
})
