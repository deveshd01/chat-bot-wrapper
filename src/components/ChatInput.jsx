import { useRef, useState } from 'react'
import CameraCapture from './CameraCapture.jsx'

const MAX_IMAGE_MB = 5

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Only image files are supported'))
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      return reject(new Error(`Image must be under ${MAX_IMAGE_MB} MB`))
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      resolve({
        dataUrl,
        base64: dataUrl.split(',')[1],
        mimeType: file.type,
        name: file.name || 'pasted-image',
      })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function ChatInput({ onSubmit, busy, disabledReason }) {
  const [text, setText] = useState('')
  const [image, setImage] = useState(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileRef = useRef(null)

  const attach = async (file) => {
    if (!file) return
    setError('')
    try {
      setImage(await readImage(file))
    } catch (e) {
      setError(e.message)
    }
  }

  const canSend = !busy && !disabledReason && (text.trim() || image)

  const submit = (e) => {
    e?.preventDefault()
    if (!canSend) return
    onSubmit({ text: text.trim(), image })
    setText('')
    setImage(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <form
      className={`chat-input ${dragging ? 'dragging' : ''}`}
      onSubmit={submit}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        attach(e.dataTransfer.files?.[0])
      }}
    >
      {image && (
        <div className="image-preview">
          <img src={image.dataUrl} alt="attachment" />
          <button type="button" className="remove-img" onClick={() => setImage(null)} title="Remove">
            ×
          </button>
        </div>
      )}

      <textarea
        rows={3}
        placeholder="Ask anything… (paste or drop an image, Ctrl+Enter to send)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
          if (file) {
            e.preventDefault()
            attach(file)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e)
        }}
      />

      <div className="chat-actions">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => attach(e.target.files?.[0])}
        />
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
          📎 Image
        </button>
        <button type="button" className="ghost" onClick={() => setCameraOpen(true)}>
          📷 Camera
        </button>
        <span className="chat-status">{error || disabledReason}</span>
        <button type="submit" className="primary" disabled={!canSend}>
          {busy ? 'Asking…' : 'Ask all models'}
        </button>
      </div>

      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(img) => {
            setError('')
            setImage(img)
            setCameraOpen(false)
          }}
        />
      )}
    </form>
  )
}
