export type AiChatProvider = 'openai' | 'codex'

export type AiChatConfig = {
  provider: AiChatProvider
  apiKey: string
  baseUrl: string
  model: string
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const DEFAULT_CODEX_MODEL = 'gpt-5.4'

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Ensure OpenAI-compatible base URL ends with /v1 */
function ensureOpenAiV1BaseUrl(url: string): string {
  const normalized = normalizeBaseUrl(url)
  if (normalized.endsWith('/v1')) return normalized
  return `${normalized}/v1`
}

export function parseAiChatProvider(raw: string): AiChatProvider {
  const value = raw.trim().toLowerCase()
  if (value === 'codex') return 'codex'
  return 'openai'
}

export function getAiChatProvider(): AiChatProvider {
  return parseAiChatProvider(trimEnv('AI_PROVIDER') || 'openai')
}

export function getAiChatConfig(): AiChatConfig {
  const provider = getAiChatProvider()

  if (provider === 'codex') {
    const apiKey = trimEnv('CODEX_API_KEY') || 'dummy'
    const baseUrl = ensureOpenAiV1BaseUrl(trimEnv('CODEX_BASE_URL'))
    const model = trimEnv('CODEX_MODEL') || DEFAULT_CODEX_MODEL

    if (!baseUrl) {
      throw new Error('CODEX_BASE_URL is not configured')
    }

    return { provider, apiKey, baseUrl, model }
  }

  const apiKey = trimEnv('OPENAI_API_KEY')
  const baseUrl = ensureOpenAiV1BaseUrl(trimEnv('OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL)
  const model = trimEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  return { provider, apiKey, baseUrl, model }
}

export function isAiApiKeyConfigError(message: string): boolean {
  return (
    message.includes('OPENAI_API_KEY is not configured') ||
    message.includes('CODEX_BASE_URL is not configured')
  )
}

export type AiChatPublicConfig = {
  provider: AiChatProvider
  providerLabel: string
  model: string
  baseUrl: string
  apiKeyConfigured: boolean
  configured: boolean
  configError?: string
  envVars: {
    provider: string
    model: string
    baseUrl: string
    apiKey: string
  }
}

export function getAiProviderLabel(provider: AiChatProvider): string {
  return provider === 'codex' ? 'Codex (ChatGPT Pro)' : 'OpenAI Platform'
}

export function getAiChatPublicConfig(): AiChatPublicConfig {
  const provider = getAiChatProvider()

  if (provider === 'codex') {
    const baseUrl = ensureOpenAiV1BaseUrl(trimEnv('CODEX_BASE_URL'))
    const model = trimEnv('CODEX_MODEL') || DEFAULT_CODEX_MODEL
    const apiKeyConfigured = true

    if (!baseUrl) {
      return {
        provider,
        providerLabel: getAiProviderLabel(provider),
        model,
        baseUrl: '',
        apiKeyConfigured: false,
        configured: false,
        configError: 'CODEX_BASE_URL is not configured',
        envVars: {
          provider: 'AI_PROVIDER',
          model: 'CODEX_MODEL',
          baseUrl: 'CODEX_BASE_URL',
          apiKey: 'CODEX_API_KEY',
        },
      }
    }

    return {
      provider,
      providerLabel: getAiProviderLabel(provider),
      model,
      baseUrl,
      apiKeyConfigured,
      configured: true,
      envVars: {
        provider: 'AI_PROVIDER',
        model: 'CODEX_MODEL',
        baseUrl: 'CODEX_BASE_URL',
        apiKey: 'CODEX_API_KEY',
      },
    }
  }

  const apiKey = trimEnv('OPENAI_API_KEY')
  const baseUrl = ensureOpenAiV1BaseUrl(trimEnv('OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL)
  const model = trimEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL

  if (!apiKey) {
    return {
      provider,
      providerLabel: getAiProviderLabel(provider),
      model,
      baseUrl,
      apiKeyConfigured: false,
      configured: false,
      configError: 'OPENAI_API_KEY is not configured',
      envVars: {
        provider: 'AI_PROVIDER',
        model: 'OPENAI_MODEL',
        baseUrl: 'OPENAI_BASE_URL',
        apiKey: 'OPENAI_API_KEY',
      },
    }
  }

  return {
    provider,
    providerLabel: getAiProviderLabel(provider),
    model,
    baseUrl,
    apiKeyConfigured: true,
    configured: true,
    envVars: {
      provider: 'AI_PROVIDER',
      model: 'OPENAI_MODEL',
      baseUrl: 'OPENAI_BASE_URL',
      apiKey: 'OPENAI_API_KEY',
    },
  }
}
