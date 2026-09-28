// Provider catalogue + a single `callModel` that talks to each API directly from the browser.
//
// Three wire formats are supported:
//   - "openai"    : OpenAI Chat Completions (also used by Groq, Mistral, DeepSeek, xAI, OpenRouter, custom)
//   - "anthropic" : Anthropic Messages API
//   - "gemini"    : Google Gemini generateContent
//
// Model names are editable in the UI, so defaults here only need to be sensible starting points.

export const PROVIDERS = [
  {
    id: 'openai',
    name: 'ChatGPT (OpenAI)',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    vision: true,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5',
    vision: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    name: 'Gemini (Google)',
    format: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    vision: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'xai',
    name: 'Grok (xAI)',
    format: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4',
    vision: true,
    keyUrl: 'https://console.x.ai',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    format: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-medium-latest',
    vision: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'groq',
    name: 'Groq (Llama)',
    format: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    vision: true,
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    vision: false,
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (any model)',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    vision: true,
    keyUrl: 'https://openrouter.ai/keys',
  },
]

/** Build the full provider list: built-ins + user-defined OpenAI-compatible ones. */
export function allProviders(customProviders = []) {
  return [
    ...PROVIDERS,
    ...customProviders.map((c) => ({ ...c, format: 'openai', custom: true })),
  ]
}

async function readError(res) {
  let detail = await res.text().catch(() => '')
  try {
    const body = JSON.parse(detail)
    detail = body?.error?.message || body?.message || detail
  } catch {
    // not JSON — keep raw text
  }
  return new Error(`HTTP ${res.status}${detail ? ` – ${detail}` : ''}`)
}

async function callOpenAI({ provider, apiKey, model, system, prompt, image, signal }) {
  const content = image && provider.vision
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image.dataUrl } },
      ]
    : prompt

  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content })

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'Chat Bot Wrapper'
  }

  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages }),
    signal,
  })
  if (!res.ok) throw await readError(res)
  const data = await res.json()
  const msg = data?.choices?.[0]?.message?.content
  if (Array.isArray(msg)) return msg.map((p) => p.text || '').join('')
  return msg ?? ''
}

async function callAnthropic({ provider, apiKey, model, system, prompt, image, signal }) {
  const content = []
  if (image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
    })
  }
  content.push({ type: 'text', text: prompt })

  const res = await fetch(`${provider.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for calling the API straight from a browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content }],
    }),
    signal,
  })
  if (!res.ok) throw await readError(res)
  const data = await res.json()
  return (data?.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

async function callGemini({ provider, apiKey, model, system, prompt, image, signal }) {
  const parts = [{ text: prompt }]
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } })

  const res = await fetch(
    `${provider.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts }],
      }),
      signal,
    },
  )
  if (!res.ok) throw await readError(res)
  const data = await res.json()
  const cand = data?.candidates?.[0]
  if (!cand) {
    const reason = data?.promptFeedback?.blockReason
    throw new Error(reason ? `Blocked: ${reason}` : 'Empty response from Gemini')
  }
  return (cand.content?.parts || []).map((p) => p.text || '').join('')
}

/**
 * Send one prompt to one provider.
 * @param {object} args
 * @param {object} args.provider  entry from allProviders()
 * @param {string} args.apiKey
 * @param {string} args.model
 * @param {string} [args.system]
 * @param {string} args.prompt
 * @param {{dataUrl:string, base64:string, mimeType:string}|null} [args.image]
 * @param {AbortSignal} [args.signal]
 */
export function callModel(args) {
  switch (args.provider.format) {
    case 'anthropic':
      return callAnthropic(args)
    case 'gemini':
      return callGemini(args)
    default:
      return callOpenAI(args)
  }
}
