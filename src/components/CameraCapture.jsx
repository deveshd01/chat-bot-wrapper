import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Full-screen camera overlay. Calls onCapture({ dataUrl, base64, mimeType, name }) with a JPEG snapshot.
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facingMode, setFacingMode] = useState('environment')
  const [canSwitch, setCanSwitch] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function start() {
      setReady(false)
      setError('')
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not supported in this browser (it needs HTTPS or localhost).')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1)
      } catch (e) {
        if (cancelled) return
        setError(
          e.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
            : e.name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : `Could not start camera: ${e.message}`,
        )
      }
    }

    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [facingMode])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const capture = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    onCapture({
      dataUrl,
      base64: dataUrl.split(',')[1],
      mimeType: 'image/jpeg',
      name: `camera-${Date.now()}.jpg`,
    })
  }

  return createPortal(
    <div className="camera-overlay" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="camera-box">
        {error ? (
          <div className="camera-error">{error}</div>
        ) : (
          <video
            ref={videoRef}
            className={facingMode === 'user' ? 'mirrored' : ''}
            playsInline
            muted
            onLoadedData={() => setReady(true)}
          />
        )}
        <div className="camera-controls">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shutter"
            onClick={capture}
            disabled={!ready || !!error}
            title="Take photo"
            aria-label="Take photo"
          />
          <button
            type="button"
            className="ghost"
            onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
            disabled={!canSwitch || !!error}
            title="Switch camera"
          >
            ⟲ Flip
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
