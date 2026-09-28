// Settings live only in this browser's localStorage — keys are never sent anywhere
// except directly to the provider they belong to.

const KEY = 'chat-bot-wrapper:settings:v1'

export const DEFAULT_SETTINGS = {
  // { [providerId]: { apiKey, model, enabled } }
  providers: {},
  // [{ id, name, baseUrl, defaultModel, vision }]
  customProviders: [],
  masterId: '',
  // OCR mode: images go only to the OCR model; everyone else gets the extracted text.
  ocrEnabled: false,
  ocrId: '',
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // storage full / blocked — settings just won't persist
  }
}
