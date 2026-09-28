import { useState } from 'react'

function ProviderRow({ provider, config, onChange, onRemove }) {
  const [showKey, setShowKey] = useState(false)
  const hasKey = Boolean(config.apiKey?.trim())

  return (
    <div className={`provider-row ${hasKey && config.enabled !== false ? 'is-active' : ''}`}>
      <div className="provider-head">
        <label className="toggle" title="Include this model in queries">
          <input
            type="checkbox"
            checked={config.enabled !== false}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          <span className="provider-name">{provider.name}</span>
        </label>
        <div className="provider-meta">
          {!provider.vision && <span className="badge muted">text only</span>}
          {hasKey && <span className="badge ok">key saved</span>}
          {provider.keyUrl && (
            <a href={provider.keyUrl} target="_blank" rel="noreferrer">
              get key
            </a>
          )}
          {onRemove && (
            <button type="button" className="link danger" onClick={onRemove}>
              remove
            </button>
          )}
        </div>
      </div>

      <div className="provider-fields">
        <div className="key-field">
          <input
            type={showKey ? 'text' : 'password'}
            placeholder="API key"
            autoComplete="off"
            spellCheck={false}
            value={config.apiKey || ''}
            onChange={(e) => onChange({ apiKey: e.target.value })}
          />
          <button type="button" className="ghost small" onClick={() => setShowKey((s) => !s)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <input
          type="text"
          placeholder={`Model (default: ${provider.defaultModel})`}
          title="Model name"
          spellCheck={false}
          value={config.model ?? ''}
          onChange={(e) => onChange({ model: e.target.value })}
        />
        <span className="field-hint">
          {config.model?.trim()
            ? `Using model: ${config.model.trim()}`
            : `Blank = default model “${provider.defaultModel}”`}
        </span>
      </div>
    </div>
  )
}

function AddCustomProvider({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', baseUrl: '', defaultModel: '', vision: true })

  if (!open) {
    return (
      <button type="button" className="ghost full" onClick={() => setOpen(true)}>
        + Add OpenAI-compatible provider
      </button>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.baseUrl.trim() || !form.defaultModel.trim()) return
    onAdd({
      id: `custom-${Date.now()}`,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/$/, ''),
      defaultModel: form.defaultModel.trim(),
      vision: form.vision,
    })
    setForm({ name: '', baseUrl: '', defaultModel: '', vision: true })
    setOpen(false)
  }

  return (
    <form className="custom-form" onSubmit={submit}>
      <input
        placeholder="Name (e.g. Together AI)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        placeholder="Base URL (e.g. https://api.together.xyz/v1)"
        value={form.baseUrl}
        onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
      />
      <input
        placeholder="Model name"
        value={form.defaultModel}
        onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
      />
      <label className="toggle">
        <input
          type="checkbox"
          checked={form.vision}
          onChange={(e) => setForm({ ...form, vision: e.target.checked })}
        />
        Supports images
      </label>
      <div className="row-actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Add
        </button>
      </div>
    </form>
  )
}

export default function SettingsPanel({ providers, settings, setSettings, onClose }) {
  const updateProvider = (id, patch) =>
    setSettings((s) => ({
      ...s,
      providers: { ...s.providers, [id]: { ...s.providers[id], ...patch } },
    }))

  const removeCustom = (id) =>
    setSettings((s) => {
      const rest = { ...s.providers }
      delete rest[id]
      return {
        ...s,
        providers: rest,
        customProviders: s.customProviders.filter((c) => c.id !== id),
        masterId: s.masterId === id ? '' : s.masterId,
      }
    })

  const withKeys = providers.filter((p) => settings.providers[p.id]?.apiKey?.trim())

  return (
    <aside className="settings">
      <div className="settings-header">
        <h2>API keys &amp; models</h2>
        <button type="button" className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="hint">
        Keys are stored only in this browser (localStorage) and sent directly to each provider.
      </p>

      <div className="master-select">
        <label htmlFor="master">Master model (writes the final answer)</label>
        <select
          id="master"
          value={settings.masterId}
          onChange={(e) => setSettings((s) => ({ ...s, masterId: e.target.value }))}
        >
          <option value="">Auto — first model with a key</option>
          {withKeys.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className={`ocr-box ${settings.ocrEnabled ? 'on' : ''}`}>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.ocrEnabled}
            onChange={(e) => setSettings((s) => ({ ...s, ocrEnabled: e.target.checked }))}
          />
          <strong>OCR mode</strong>
        </label>
        <p className="hint">
          Images are sent only to the OCR model, which extracts their text. Then every enabled
          model — including text-only ones — and the master receive your prompt + that text, with
          no image, to cut token cost.
        </p>
        {settings.ocrEnabled && (
          <>
            <label htmlFor="ocr">OCR model</label>
            <select
              id="ocr"
              value={settings.ocrId}
              onChange={(e) => setSettings((s) => ({ ...s, ocrId: e.target.value }))}
            >
              <option value="">Auto — first image-capable model with a key</option>
              {withKeys
                .filter((p) => p.vision)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            {withKeys.filter((p) => p.vision).length === 0 && (
              <span className="error-text field-hint">
                Save a key for an image-capable model to use OCR.
              </span>
            )}
          </>
        )}
      </div>

      <div className="provider-list">
        {providers.map((p) => (
          <ProviderRow
            key={p.id}
            provider={p}
            config={settings.providers[p.id] || {}}
            onChange={(patch) => updateProvider(p.id, patch)}
            onRemove={p.custom ? () => removeCustom(p.id) : undefined}
          />
        ))}
      </div>

      <AddCustomProvider
        onAdd={(c) => setSettings((s) => ({ ...s, customProviders: [...s.customProviders, c] }))}
      />
    </aside>
  )
}
