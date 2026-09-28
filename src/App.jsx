import { useEffect, useMemo, useState } from 'react'
import './App.css'
import SettingsPanel from './components/SettingsPanel.jsx'
import ChatInput from './components/ChatInput.jsx'
import ResponseCard from './components/ResponseCard.jsx'
import { allProviders, callModel } from './lib/providers.js'
import {
  MASTER_SYSTEM_PROMPT,
  MODEL_SYSTEM_PROMPT,
  OCR_PROMPT,
  buildMasterPrompt,
  buildOcrPrompt,
} from './lib/prompts.js'
import { loadSettings, saveSettings } from './lib/storage.js'

function modelFor(provider, settings) {
  return settings.providers[provider.id]?.model?.trim() || provider.defaultModel
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [runs, setRuns] = useState([])

  useEffect(() => saveSettings(settings), [settings])

  const providers = useMemo(() => allProviders(settings.customProviders), [settings.customProviders])

  const activeProviders = providers.filter((p) => {
    const cfg = settings.providers[p.id]
    return cfg?.apiKey?.trim() && cfg.enabled !== false
  })

  const master =
    providers.find((p) => p.id === settings.masterId && settings.providers[p.id]?.apiKey?.trim()) ||
    activeProviders[0]

  const hasKey = (p) => Boolean(settings.providers[p.id]?.apiKey?.trim())
  const ocrProvider = settings.ocrEnabled
    ? providers.find((p) => p.id === settings.ocrId && p.vision && hasKey(p)) ||
      providers.find((p) => p.vision && hasKey(p))
    : null

  const busy = runs.some(
    (r) =>
      r.final.status === 'loading' ||
      r.ocr?.status === 'loading' ||
      r.results.some((x) => x.status === 'loading'),
  )

  // Open settings on first visit when no keys are saved yet.
  useEffect(() => {
    if (activeProviders.length === 0) setShowSettings(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patchRun = (runId, fn) =>
    setRuns((rs) => rs.map((r) => (r.id === runId ? { ...r, ...fn(r) } : r)))

  const summarize = async (runId, question, image, results, masterProvider) => {
    const ok = results.filter((r) => r.status === 'done' && r.text?.trim())
    if (!masterProvider) {
      patchRun(runId, () => ({ final: { status: 'error', error: 'No master model configured.' } }))
      return
    }
    if (ok.length === 0) {
      patchRun(runId, () => ({ final: { status: 'error', error: 'No model returned an answer.' } }))
      return
    }

    const masterModel = modelFor(masterProvider, settings)
    patchRun(runId, () => ({
      final: { status: 'loading', masterName: masterProvider.name, masterModel },
    }))

    try {
      const text = await callModel({
        provider: masterProvider,
        apiKey: settings.providers[masterProvider.id].apiKey.trim(),
        model: masterModel,
        system: MASTER_SYSTEM_PROMPT,
        prompt: buildMasterPrompt(question, ok),
        image: masterProvider.vision ? image : null,
      })
      patchRun(runId, (r) => ({ final: { ...r.final, status: 'done', text } }))
    } catch (e) {
      patchRun(runId, (r) => ({ final: { ...r.final, status: 'error', error: e.message } }))
    }
  }

  const ask = async ({ text, image }) => {
    const runId = crypto.randomUUID()
    const masterProvider = master
    const useOcr = Boolean(image && ocrProvider)
    const initial = activeProviders.map((p) => ({
      providerId: p.id,
      providerName: p.name,
      model: modelFor(p, settings),
      status: useOcr ? 'waiting' : 'loading',
    }))

    setRuns((rs) => [
      {
        id: runId,
        question: text,
        image,
        // What the answering models + master actually receive.
        prompt: text,
        sharedImage: image,
        ocr: useOcr
          ? {
              providerName: ocrProvider.name,
              model: modelFor(ocrProvider, settings),
              status: 'loading',
            }
          : null,
        results: initial,
        final: { status: 'waiting' },
      },
      ...rs,
    ])

    // Step 1 (OCR mode): only the OCR model sees the image.
    let prompt = text
    let sharedImage = image
    if (useOcr) {
      const started = performance.now()
      try {
        const ocrText = await callModel({
          provider: ocrProvider,
          apiKey: settings.providers[ocrProvider.id].apiKey.trim(),
          model: modelFor(ocrProvider, settings),
          prompt: OCR_PROMPT,
          image,
        })
        if (!ocrText.trim()) throw new Error('OCR model returned no text.')
        prompt = buildOcrPrompt(text, ocrText)
        sharedImage = null
        patchRun(runId, (r) => ({
          prompt,
          sharedImage,
          ocr: { ...r.ocr, status: 'done', text: ocrText, ms: performance.now() - started },
          results: r.results.map((x) => ({ ...x, status: 'loading' })),
        }))
      } catch (e) {
        const error = `OCR failed: ${e.message}`
        patchRun(runId, (r) => ({
          ocr: { ...r.ocr, status: 'error', error, ms: performance.now() - started },
          results: r.results.map((x) => ({ ...x, status: 'error', error: 'Skipped — OCR failed.' })),
          final: { status: 'error', error: `${error} Turn off OCR mode or pick another OCR model.` },
        }))
        return
      }
    }

    // Step 2: every enabled model answers in parallel.
    const settled = await Promise.all(
      activeProviders.map(async (p, i) => {
        const started = performance.now()
        const base = initial[i]
        let result
        if (sharedImage && !p.vision && !text) {
          result = { ...base, status: 'error', error: 'This model cannot read images.' }
        } else {
          try {
            const out = await callModel({
              provider: p,
              apiKey: settings.providers[p.id].apiKey.trim(),
              model: base.model,
              system: MODEL_SYSTEM_PROMPT,
              prompt: prompt || 'Answer the question shown in this image.',
              image: sharedImage,
            })
            result = { ...base, status: 'done', text: out }
          } catch (e) {
            result = { ...base, status: 'error', error: e.message }
          }
        }
        result.ms = performance.now() - started
        patchRun(runId, (r) => ({
          results: r.results.map((x) => (x.providerId === p.id ? result : x)),
        }))
        return result
      }),
    )

    // Step 3: master merges the answers (gets the image only when OCR was not used).
    await summarize(runId, prompt, sharedImage, settled, masterProvider)
  }

  const disabledReason =
    activeProviders.length === 0 ? 'Add at least one API key in Settings to start.' : ''

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◎</span>
          <div>
            <h1>Chat Bot Wrapper</h1>
            <p>Ask every AI at once — get one answer.</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className="pill">
            {activeProviders.length} model{activeProviders.length === 1 ? '' : 's'} · master:{' '}
            {master ? master.name : 'none'}
            {ocrProvider && ` · OCR: ${ocrProvider.name}`}
          </span>
          <button type="button" className="ghost" onClick={() => setShowSettings((s) => !s)}>
            ⚙ Settings
          </button>
        </div>
      </header>

      <div className="layout">
        <main className="main">
          <ChatInput onSubmit={ask} busy={busy} disabledReason={disabledReason} />

          {runs.length === 0 && (
            <div className="empty">
              <h3>How it works</h3>
              <ol>
                <li>Save API keys for the models you want (ChatGPT, Claude, Gemini, Grok…).</li>
                <li>Ask a question — optionally attach an image.</li>
                <li>Every model answers in parallel.</li>
                <li>
                  The master model merges them into one final answer. For MCQs it returns only the
                  correct option.
                </li>
              </ol>
            </div>
          )}

          {runs.map((run) => (
            <section key={run.id} className="run">
              <div className="question">
                {run.image && <img src={run.image.dataUrl} alt="attached" />}
                <p>{run.question || <em>(image only)</em>}</p>
              </div>

              <div className={`final ${run.final.status}`}>
                <div className="final-head">
                  <span>Final answer</span>
                  {run.final.masterName && (
                    <span className="final-master">
                      by {run.final.masterName} · {run.final.masterModel}
                    </span>
                  )}
                  {(run.final.status === 'done' || run.final.status === 'error') && (
                    <button
                      type="button"
                      className="ghost small"
                      disabled={busy}
                      title="Summarize again with the currently selected master model"
                      onClick={() =>
                        summarize(run.id, run.prompt, run.sharedImage, run.results, master)
                      }
                    >
                      ↻ Re-summarize{master ? ` with ${master.name}` : ''}
                    </button>
                  )}
                </div>
                <div className="final-body">
                  {run.final.status === 'waiting' && (
                    <span className="muted">
                      {run.ocr?.status === 'loading'
                        ? 'Extracting text from the image…'
                        : 'Waiting for all models to respond…'}
                    </span>
                  )}
                  {run.final.status === 'loading' && (
                    <span className="muted">Master model is summarizing…</span>
                  )}
                  {run.final.status === 'done' && run.final.text}
                  {run.final.status === 'error' && (
                    <span className="error-text">{run.final.error}</span>
                  )}
                </div>
              </div>

              {run.ocr && (
                <ResponseCard
                  className="ocr-card"
                  tag="OCR"
                  result={{ providerId: 'ocr', ...run.ocr }}
                />
              )}

              <details className="individual" open={run.final.status !== 'done'}>
                <summary>
                  Individual responses ({run.results.filter((r) => r.status === 'done').length}/
                  {run.results.length})
                </summary>
                <div className="response-grid">
                  {run.results.map((r) => (
                    <ResponseCard key={r.providerId} result={r} />
                  ))}
                </div>
              </details>
            </section>
          ))}
        </main>

        {showSettings && (
          <>
            <div className="settings-backdrop" onClick={() => setShowSettings(false)} />
            <SettingsPanel
              providers={providers}
              settings={settings}
              setSettings={setSettings}
              onClose={() => setShowSettings(false)}
            />
          </>
        )}
      </div>
    </div>
  )
}
