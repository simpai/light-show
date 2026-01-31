import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { Upload, Zap, Download, CheckCircle, Car, Music, Eye, Play, Pause, Edit3 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FseqParser } from './utils/FseqParser'
import JSZip from 'jszip'
import Visualizer from './components/Visualizer'
import MatrixVisualizer from './components/MatrixVisualizer'
import EditorApp from './components/EditorApp'
import './App.css'

function App() {
  const [mode, setMode] = useState('generator') // 'generator', 'viewer', 'editor'
  // Generator States
  const [file, setFile] = useState(null)
  const [fseqFile, setFseqFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)

  // Matrix Mode State
  const [isMatrixMode, setIsMatrixMode] = useState(false)
  const [matrixConfig, setMatrixConfig] = useState({ rows: 10, cols: 10 })

  // Matrix Viewer State
  const [isMatrixPlayback, setIsMatrixPlayback] = useState(false)
  const [matrixData, setMatrixData] = useState({}) // { "r_c": { parser, header } }
  const [matrixGrid, setMatrixGrid] = useState({ rows: 10, cols: 10 })

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

        // Detect if it's actually a bundle renamed to audio or something?
        // Unlikely, but safety check for .ls files chosen here
        if (selectedFile.name.endsWith('.ls')) {
          handleBundleChange({ target: { files: [selectedFile] } });
        }
      } else {
        setError("Please upload a valid audio file (WAV or MP3)")
      }
    }
  }

  const handleFseqChange = async (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setIsMatrixPlayback(false)
      setMatrixData({})

      if (selectedFile.name.endsWith('.zip')) {
        // Handle Matrix Zip
        try {
          const zip = await JSZip.loadAsync(selectedFile)
          const newMatrixData = {}
          let maxR = 0, maxC = 0

          // Parse all fseq files in zip
          const promises = []

          zip.forEach((relativePath, zipEntry) => {
            if (zipEntry.name.endsWith('.fseq')) {
              const baseName = zipEntry.name.replace('.fseq', '');
              let r = -1, c = -1;

              // 1. Try New Convention: A01, B02...
              const newMatch = baseName.match(/^([A-Za-z])(\d+)$/);
              if (newMatch) {
                r = newMatch[1].toUpperCase().charCodeAt(0) - 65; // A=0, B=1...
                c = parseInt(newMatch[2]) - 1; // 01=0, 02=1...
              } else {
                // 2. Try Old Convention: x0_y1, 0_1...
                const oldMatch = baseName.match(/^(?:x)?(\d+)[_](?:y)?(\d+)$/i);
                if (oldMatch) {
                  // In old format, it was usually index-based
                  // Often it was x_y, but sometimes y_x. 
                  // Let's assume the previous logic was r=parts[0], c=parts[1]
                  r = parseInt(oldMatch[1]);
                  c = parseInt(oldMatch[2]);
                }
              }

              if (r !== -1 && c !== -1 && !isNaN(r) && !isNaN(c)) {
                maxR = Math.max(maxR, r);
                maxC = Math.max(maxC, c);

                promises.push(
                  zipEntry.async('arraybuffer').then(buffer => {
                    try {
                      const parser = new FseqParser(buffer);
                      const header = parser.parse();
                      newMatrixData[`${r}_${c}`] = { parser, header };
                    } catch (err) {
                      console.warn("Failed to parse fseq in zip:", zipEntry.name);
                    }
                  })
                );
              }
            }
          })

          await Promise.all(promises)

          if (Object.keys(newMatrixData).length > 0) {
            setMatrixData(newMatrixData)
            setMatrixGrid({ rows: maxR + 1, cols: maxC + 1 })
            setIsMatrixPlayback(true)

            // Set playback header from first found file for timing
            const firstKey = Object.keys(newMatrixData)[0]
            setPlaybackData({ header: newMatrixData[firstKey].header })
            setFseqFile(selectedFile)
            setError(null)
          } else {
            setError("No valid matrix .fseq files found in zip")
          }

        } catch (err) {
          setError("Failed to parse ZIP file: " + err.message)
        }
      } else if (selectedFile.name.endsWith('.ls')) {
        // Project Bundle
        handleBundleChange(e);
      } else {
        setError("Please upload a .fseq, .zip, or .ls file")
      }
    }
  }

  const handleBundleChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.endsWith('.ls')) {
      setLoading(true);
      setError(null);
      try {
        const zip = await JSZip.loadAsync(selectedFile);

        // 1. Load project.json
        const jsonFile = zip.file("project.json");
        if (!jsonFile) throw new Error("Not a valid lightshow bundle (missing project.json)");

        const jsonText = await jsonFile.async("string");
        const data = JSON.parse(jsonText);

        // 2. Load Audio from bundle
        const audioName = data.audioFileName;
        if (audioName) {
          const audioInZip = zip.file(audioName);
          if (audioInZip) {
            const audioBlob = await audioInZip.async("blob");
            const audioFileObj = new File([audioBlob], audioName, { type: audioBlob.type });
            setFile(audioFileObj);
            setAudioUrl(URL.createObjectURL(audioFileObj));
          }
        }

        // 3. Set analysis data and enter editor mode
        // Note: ProjectState mapping happens automatically in the Editor/EditorApp component
        // We just need to pass the analysis data if it exists or trigger an initial state
        setAnalysisData(data); // Editor component will handle .project and .layoutData from this
        setMode('editor');
        console.log('Project bundle recognized in main screen');

      } catch (err) {
        setError("Failed to load project bundle: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('audio', file)

    if (isMatrixMode) {
      formData.append('mode', 'matrix')
      formData.append('rows', matrixConfig.rows)
      formData.append('cols', matrixConfig.cols)
    }

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

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const response = await axios.post('/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data.success) {
        setAnalysisData(response.data.analysis);
        setMode('editor');
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to analyze audio.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.file_id) return
    window.location.href = `/download/${result.file_id}`
  }

  // Animation loop for viewer
  const animate = () => {
    if (audioRef.current && (playbackData || isMatrixPlayback)) {
      const currentTime = audioRef.current.currentTime

      // Use header from playbackData (single) or first matrix file which is set in handleFseqChange
      const header = playbackData?.header
      if (header) {
        const frameIndex = Math.floor((currentTime * 1000) / header.stepTime)

        if (isMatrixPlayback) {
          // Matrix Mode: Pass frame index to visualizer, it handles lookups
          setCurrentFrameData(frameIndex)
        } else {
          // Single Mode: Get frame directly
          const frame = playbackData.parser.getFrame(frameIndex)
          setCurrentFrameData(frame)
        }
      }
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

  if (mode === 'editor') {
    return (
      <EditorApp
        audioFile={file}
        analysis={analysisData}
        bundledData={analysisData} // Pass the whole bundle if it was loaded from .ls
        onExit={() => setMode('generator')}
      />
    );
  }

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

                  <div className="matrix-toggle" style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        id="matrixMode"
                        checked={isMatrixMode}
                        onChange={(e) => setIsMatrixMode(e.target.checked)}
                      />
                      <label htmlFor="matrixMode" style={{ fontWeight: 'bold' }}>Enable Matrix Mode (Multi-Car Grid)</label>
                    </div>

                    {isMatrixMode && (
                      <div className="matrix-config" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Rows</label>
                          <input
                            type="number"
                            value={matrixConfig.rows}
                            onChange={(e) => setMatrixConfig({ ...matrixConfig, rows: parseInt(e.target.value) || 10 })}
                            style={{ width: '60px', padding: '0.3rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: 'white', textAlign: 'center' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Cols</label>
                          <input
                            type="number"
                            value={matrixConfig.cols}
                            onChange={(e) => setMatrixConfig({ ...matrixConfig, cols: parseInt(e.target.value) || 10 })}
                            style={{ width: '60px', padding: '0.3rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: 'white', textAlign: 'center' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {error && <p className="status-text">{error}</p>}

                  <div className="action-buttons" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
                    <button
                      className="btn-tesla"
                      onClick={handleUpload}
                      disabled={!file || loading}
                    >
                      {loading ? "Processing..." : "Auto-Generate Show"}
                    </button>
                    <button
                      className="btn-tesla btn-secondary"
                      onClick={handleAnalyze}
                      disabled={!file || loading}
                      style={{ background: '#333', border: '1px solid #555' }}
                    >
                      <Edit3 size={20} style={{ marginRight: '5px' }} />
                      Advanced Editor
                    </button>
                  </div>

                  <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
                    <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Already have a project?</p>
                    <button
                      className="btn-link"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.ls';
                        input.onchange = (e) => handleBundleChange(e);
                        input.click();
                      }}
                      style={{ fontSize: '14px' }}
                    >
                      📁 Load Project Bundle (.ls)
                    </button>
                  </div>
                </>
              ) : (
                <div className="success-view">
                  <CheckCircle size={64} className="tesla-red" style={{ marginBottom: '1.5rem' }} />
                  <h2>{result.mode === 'matrix' ? "Matrix Show Ready!" : "Sequence Ready!"}</h2>
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
                    {result.mode === 'matrix' ? "Download Matrix .zip" : "Download .fseq"}
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
                    <span>{fseqFile ? fseqFile.name : "Select .fseq / .zip"}</span>
                    <input type="file" ref={fseqInputRef} onChange={handleFseqChange} style={{ display: 'none' }} accept=".fseq,.zip" />
                  </div>
                  <div className="mini-upload" onClick={() => fileInputRef.current.click()}>
                    <Music size={20} className={file ? "tesla-red" : ""} />
                    <span>{file ? file.name : "Select Audio"}</span>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="audio/*" />
                  </div>
                </div>
              </div>

              {isMatrixPlayback ? (
                <MatrixVisualizer
                  matrixData={matrixData}
                  frameIndex={currentFrameData}
                  rows={matrixGrid.rows}
                  cols={matrixGrid.cols}
                />
              ) : (
                <Visualizer frameData={currentFrameData} />
              )}

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
