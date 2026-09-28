import { useState } from 'react'

export default function ResponseCard({ result, tag, className = '' }) {
  const [open, setOpen] = useState(false)
  const { status, providerName, model, text, error, ms } = result

  return (
    <div className={`response-card ${status} ${className}`}>
      <button type="button" className="response-head" onClick={() => setOpen((o) => !o)}>
        <span className={`dot ${status}`} />
        <span className="response-name">{providerName}</span>
        {tag && <span className="ocr-tag">{tag}</span>}
        <span className="response-model">{model}</span>
        <span className="response-time">
          {status === 'loading'
            ? tag
              ? 'reading image…'
              : 'thinking…'
            : status === 'waiting'
              ? 'waiting for OCR…'
              : ms != null
                ? `${(ms / 1000).toFixed(1)}s`
                : ''}
        </span>
        <span className="chevron">{open ? '▾' : '▸'}</span>
      </button>
      {status === 'error' && <div className="response-body error-text">{error}</div>}
      {status === 'done' && (
        <div className={`response-body ${open ? '' : 'clamped'}`}>{text || '(empty response)'}</div>
      )}
    </div>
  )
}
