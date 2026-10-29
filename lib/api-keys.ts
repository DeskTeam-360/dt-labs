import { createHash, randomBytes } from 'crypto'

export const API_KEY_PREFIX = 'dtk_'

export const hashApiKey = (key: string): string => createHash('sha256').update(key).digest('hex')

/** A new key: shown to the person once; only its hash is stored. `prefix` is kept to recognise the key in the list. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) }
}
