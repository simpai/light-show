import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { Upload, Zap, Download, CheckCircle, Car, Music, Eye, Play, Pause } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FseqParser } from './utils/FseqParser'
import Visualizer from './components/Visualizer'
import './App.css'

function App() {
  const [mode, setMode] = useState('generator') // 'generator' or 'viewer'
  const [file, setFile] = useState(null)
  const [fseqFile, setFseqFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Viewer States
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackData, setPlaybackData] = useState(null)
  const [currentFrameData, setCurrentFrameData] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)

  const fileInputRef = useRef(null)
  const fseqInputRef = useRef(null)
  const audioRef = useRef(null)
  const requestRef = useRef()

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      if (selectedFile.type.startsWith('audio/')) {
        setFile(selectedFile)
        setAudioUrl(URL.createObjectURL(selectedFile))
        setError(null)
        setResult(null)
      } else {
        setError("Please upload a valid audio file (WAV or MP3)")
      }
    }
  }

  const handleFseqChange = async (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      if (selectedFile.name.endsWith('.fseq')) {
        const buffer = await selectedFile.arrayBuffer()
        try {
          const parser = new FseqParser(buffer)
          const header = parser.parse()
          setFseqFile(selectedFile)
          setPlaybackData({ parser, header })
          setError(null)
        } catch (err) {
          setError(err.message)
        }
      } else {
        setError("Please upload a valid .fseq file")
      }
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('audio', file)

    try {
      const response = await axios.post('/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(response.data)
    } catch (err) {
      setError(err.response?.data?.error || "Failed to generate light show. Is the server running?")
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!result?.file_id) return
    window.location.href = `/download/${result.file_id}`
  }

  // Animation loop for viewer
  const animate = () => {
    if (audioRef.current && playbackData) {
      const currentTime = audioRef.current.currentTime
      const frameIndex = Math.floor((currentTime * 1000) / playbackData.header.stepTime)
      const frame = playbackData.parser.getFrame(frameIndex)
      setCurrentFrameData(frame)
    }
    requestRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(requestRef.current)
    }
    return () => cancelAnimationFrame(requestRef.current)
  }, [isPlaying, playbackData])

  return (
    <div className="container">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="logo">
          <Car size={32} className="tesla-red" />
          <span>INERTIAL SPIRIT</span>
        </div>
        <h1>Tesla <span className="tesla-red">Light Show</span> Tool</h1>

        <div className="mode-selector">
          <button
            className={mode === 'generator' ? 'active' : ''}
            onClick={() => setMode('generator')}
          >
            Generator
          </button>
          <button
            className={mode === 'viewer' ? 'active' : ''}
            onClick={() => setMode('viewer')}
          >
            Viewer
          </button>
        </div>
      </motion.header>

      <main>
        <AnimatePresence mode="wait">
          {mode === 'generator' ? (
            <motion.div
              className="glass-card"
              key="generator"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {!result ? (
                <>
                  <div
                    className="upload-zone"
                    onClick={() => fileInputRef.current.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const droppedFile = e.dataTransfer.files[0]
                      if (droppedFile) {
                        setFile(droppedFile)
                        setError(null)
                      }
                    }}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                      accept="audio/*"
                    />
                    <div className="upload-icon-wrapper">
                      <Music className={file ? "tesla-red" : ""} size={48} />
                    </div>
                    <h3>{file ? file.name : "Select Audio File"}</h3>
                  </div>

                  {error && <p className="status-text">{error}</p>}

                  <button
                    className="btn-tesla"
                    onClick={handleUpload}
                    disabled={!file || loading}
                  >
                    {loading ? "Building..." : "Generate Show"}
                  </button>
                </>
              ) : (
                <div className="success-view">
                  <CheckCircle size={64} className="tesla-red" style={{ marginBottom: '1.5rem' }} />
                  <h2>Sequence Ready!</h2>
                  <div className="stats">
                    <div className="stat-item">
                      <span className="label">Duration</span>
                      <span className="value">{Math.round(result.duration)}s</span>
                    </div>
                    <div className="stat-item">
                      <span className="label">Frames</span>
                      <span className="value">{result.frame_count}</span>
                    </div>
                  </div>
                  <button className="btn-tesla" onClick={handleDownload} style={{ marginTop: '2rem' }}>
                    <Download size={20} />
                    Download .fseq
                  </button>
                  <button
                    className="btn-link"
                    onClick={() => { setResult(null); setFile(null) }}
                  >
                    Start Over
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              className="glass-card viewer-card"
              key="viewer"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="viewer-setup">
                <div className="file-inputs">
                  <div className="mini-upload" onClick={() => fseqInputRef.current.click()}>
                    <Zap size={20} className={fseqFile ? "tesla-red" : ""} />
                    <span>{fseqFile ? fseqFile.name : "Select .fseq"}</span>
                    <input type="file" ref={fseqInputRef} onChange={handleFseqChange} style={{ display: 'none' }} accept=".fseq" />
                  </div>
                  <div className="mini-upload" onClick={() => fileInputRef.current.click()}>
                    <Music size={20} className={file ? "tesla-red" : ""} />
                    <span>{file ? file.name : "Select Audio"}</span>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="audio/*" />
                  </div>
                </div>
              </div>

              <Visualizer frameData={currentFrameData} />

              <div className="player-controls">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  controls
                />
              </div>
              {error && <p className="status-text">{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        <section className="features">
          <div className="feature-item">
            <Zap className="tesla-red" />
            <h3>Beat Detection</h3>
          </div>
          <div className="feature-item">
            <Car className="tesla-red" />
            <h3>Multi-Model Support</h3>
            <p>Compatible with Model S, 3, X, Y and Cybertruck.</p>
          </div>
          <div className="feature-item">
            <CheckCircle className="tesla-red" />
            <h3>Verified Format</h3>
            <p>Outputs uncompressed FSEQ V2 compliant with Tesla's validator.</p>
          </div>
        </section>
      </main>

      <footer>
        <p>&copy; 2024 Inertial Spirit &bull; Official Tesla Light Show Specs</p>
      </footer>
    </div>
  )
}

export default App
