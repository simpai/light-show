import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Save, Plus, Layers, Upload, Wand2, Image as ImageIcon } from 'lucide-react';
import { ProjectState } from '../core/ProjectState';
import { ShowRenderer } from '../core/ShowRenderer';
import { Timeline } from './Timeline';
import Scene3D from './Scene3D';
import ClipEditor from './ClipEditor';
import { LayoutParser } from '../utils/LayoutParser';
import MatrixPreview2D from './MatrixPreview2D';
import axios from 'axios';

export default function EditorApp() {
    const [project, setProject] = useState(new ProjectState());
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [selectedClipId, setSelectedClipId] = useState(null);
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [matrixConfig, setMatrixConfig] = useState({ rows: 16, cols: 63 });
    const [audioFile, setAudioFile] = useState(null);
    const [audioFileName, setAudioFileName] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Layout system state
    const [layoutData, setLayoutData] = useState(null);
    const [layoutFileName, setLayoutFileName] = useState('');
    const [colSpacing, setColSpacing] = useState(2.5);
    const [rowSpacing, setRowSpacing] = useState(6);
    const [viewMode, setViewMode] = useState('2d'); // '2d' or '3d'

    const audioRef = useRef(null);
    const rendererRef = useRef(new ShowRenderer());
    const requestRef = useRef();
    const fileInputRef = useRef(null);
    const layoutInputRef = useRef(null);
    const audioUrlRef = useRef(null); // Cache audio URL

    // Initialize with one default track
    useEffect(() => {
        const newProject = new ProjectState();
        newProject.addLayer('Track 1');
        newProject.duration = 60000; // Default 60s
        setProject(newProject);
        setSelectedLayerId(newProject.layers[0].id);
        rendererRef.current.setProject(newProject);
        rendererRef.current.setMatrixMode(true, matrixConfig);

        // Initialize with default layout
        const defaultLayout = LayoutParser.createDefaultLayout(matrixConfig.cols, matrixConfig.rows);
        setLayoutData(defaultLayout);
    }, []);

    useEffect(() => {
        rendererRef.current.setMatrixMode(true, matrixConfig);
    }, [matrixConfig]);

    // Handle image upload from ClipEditor
    useEffect(() => {
        const handleImageUpload = async (event) => {
            const { clipId, file } = event.detail;

            try {
                // Import ImageProcessor
                const { ImageProcessor } = await import('../utils/ImageProcessor');

                // Parse image/GIF
                let asset;
                if (file.type === 'image/gif') {
                    asset = await ImageProcessor.parseGIF(file);
                } else {
                    asset = await ImageProcessor.loadImage(file);
                }

                // Store asset
                const assetId = crypto.randomUUID();
                project.assets[assetId] = asset;

                // Update clip
                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                for (const layer of newProject.layers) {
                    const clip = layer.clips.find(c => c.id === clipId);
                    if (clip) {
                        clip.assetId = assetId;
                        clip.fps = asset.fps;
                        break;
                    }
                }

                setProject(newProject);
                rendererRef.current.setProject(newProject);
                console.log('Image uploaded:', asset.width, 'x', asset.height, asset.frames.length, 'frames');
            } catch (err) {
                console.error('Failed to upload image:', err);
                alert('Failed to upload image: ' + err.message);
            }
        };

        window.addEventListener('imageUpload', handleImageUpload);
        return () => window.removeEventListener('imageUpload', handleImageUpload);
    }, [project]);

    const animate = () => {
        if (audioRef.current && !audioRef.current.paused) {
            const time = audioRef.current.currentTime * 1000;
            setCurrentTime(time);
        }
        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    const togglePlay = () => {
        if (!audioFile) {
            alert('Please upload an audio file first');
            return;
        }

        console.log('Toggle play:', { isPlaying, hasAudioRef: !!audioRef.current, audioFile: audioFile?.name });

        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
        } else {
            if (audioRef.current) {
                audioRef.current.play()
                    .then(() => {
                        console.log('Audio playing successfully');
                        setIsPlaying(true);
                    })
                    .catch(err => {
                        console.error('Play failed:', err);
                        alert('Failed to play audio: ' + err.message);
                    });
            }
        }
    };

    const handleAudioUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Revoke old URL if exists
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
            }

            // Create new URL and cache it
            audioUrlRef.current = URL.createObjectURL(file);

            setAudioFile(file);
            setAudioFileName(file.name);
            setIsPlaying(false);
            setCurrentTime(0);

            // Get duration from audio file
            const audio = new Audio(audioUrlRef.current);
            audio.addEventListener('loadedmetadata', () => {
                const duration = audio.duration * 1000;
                project.duration = duration;
                setProject(Object.assign(Object.create(Object.getPrototypeOf(project)), project));
            });
        }
    };

    const handleAnalyzeAudio = async () => {
        if (!audioFile) {
            alert('Please upload an audio file first');
            return;
        }

        setIsAnalyzing(true);
        const formData = new FormData();
        formData.append('audio', audioFile);

        try {
            const response = await axios.post('/analyze', formData);
            if (response.data.success) {
                project.loadAnalysis(response.data.analysis);
                setProject(Object.assign(Object.create(Object.getPrototypeOf(project)), project));
                alert('Audio analysis complete! Beat markers added to timeline.');
            }
        } catch (err) {
            alert('Analysis failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleLayoutUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const parsed = await LayoutParser.parseLayoutImage(file, colSpacing, rowSpacing);
                setLayoutData(parsed);
                setLayoutFileName(file.name);

                // Update matrix config based on image dimensions
                const newConfig = {
                    rows: parsed.height,
                    cols: parsed.width
                };
                setMatrixConfig(newConfig);
                rendererRef.current.setMatrixMode(true, newConfig);

                console.log('Layout loaded:', parsed.width, 'x', parsed.height);
            } catch (err) {
                console.error('Failed to load layout:', err);
                alert('Failed to load layout image: ' + err.message);
            }
        }
    };

    const handleSpacingChange = async () => {
        if (layoutData && layoutFileName) {
            // Re-parse with new spacing values
            // We need to reload the file, but we don't have it anymore
            // So just update the layout data offsets
            const updatedLayout = { ...layoutData };
            for (let r = 0; r < updatedLayout.height; r++) {
                for (let c = 0; c < updatedLayout.width; c++) {
                    const cell = updatedLayout.layout[r][c];
                    const raw = cell.raw;
                    cell.offsetX = ((raw.r - 127) / 127) * colSpacing;
                    cell.offsetY = ((raw.g - 127) / 127) * rowSpacing;
                }
            }
            setLayoutData(updatedLayout);
        }
    };

    const handleSeek = (timeMs) => {
        if (audioRef.current) {
            audioRef.current.currentTime = timeMs / 1000;
            setCurrentTime(timeMs);
        }
    };

    const handleReset = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setCurrentTime(0);
            setIsPlaying(false);
        }
    };

    const handleAddTrack = () => {
        project.addLayer(`Track ${project.layers.length + 1}`);
        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        setProject(newProject);
        setSelectedLayerId(newProject.layers[newProject.layers.length - 1].id);
    };

    const handleClipUpdate = (updatedClip) => {
        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        newProject.layers.forEach(layer => {
            const idx = layer.clips.findIndex(c => c.id === updatedClip.id);
            if (idx !== -1) {
                layer.clips[idx] = updatedClip;
            }
        });
        setProject(newProject);
        rendererRef.current.setProject(newProject);
        setSelectedClipId(updatedClip.id);
    };

    const handleClipDelete = (clipId) => {
        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
        newProject.layers.forEach(layer => {
            layer.clips = layer.clips.filter(c => c.id !== clipId);
        });
        setProject(newProject);
        rendererRef.current.setProject(newProject);
        setSelectedClipId(null);
    };

    const handleAddClip = () => {
        if (project.layers.length > 0) {
            const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
            const targetLayerId = selectedLayerId || newProject.layers[0].id;
            const layer = newProject.layers.find(l => l.id === targetLayerId);

            if (layer) {
                const newClip = {
                    id: crypto.randomUUID(),
                    startTime: currentTime,
                    duration: 1000,
                    type: 'effect',
                    effectType: 'flash',
                    speed: 1,
                    channels: [0, 1, 2, 3],
                    fadeIn: 0,
                    fadeOut: 0,
                    pattern: 'uniform',
                    patternDirection: 'horizontal',
                    patternSpeed: 1.0
                };
                layer.clips.push(newClip);
                setProject(newProject);
                rendererRef.current.setProject(newProject);
                setSelectedClipId(newClip.id);
            }
        }
    };

    const handleExport = async () => {
        try {
            const response = await axios.post('/export', {
                project: project,
                matrixMode: true,
                matrixConfig: matrixConfig,
                layoutData: layoutData
            });
            if (response.data.success) {
                const ext = response.data.extension || '.fseq';
                window.location.href = `/download/${response.data.file_id}${ext}`;
            }
        } catch (err) {
            console.error("Export failed", err);
            alert("Export failed: " + (err.response?.data?.error || err.message));
        }
    };

    let selectedClip = null;
    if (selectedClipId) {
        for (const layer of project.layers) {
            const found = layer.clips.find(c => c.id === selectedClipId);
            if (found) {
                selectedClip = found;
                break;
            }
        }
    }

    const handleSaveProject = () => {
        const projectData = {
            version: '1.0',
            project: project.toJSON(),
            matrixConfig,
            audioFileName,
            layoutFileName,
            layoutData,
            colSpacing,
            rowSpacing
        };

        const json = JSON.stringify(projectData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `lightshow-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        console.log('Project saved');
    };

    const handleLoadProject = async (file) => {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Load project
            const loadedProject = await ProjectState.fromJSON(data.project);
            setProject(loadedProject);
            rendererRef.current.setProject(loadedProject);

            // Restore matrix config
            if (data.matrixConfig) {
                setMatrixConfig(data.matrixConfig);
            }

            // Restore layout data
            if (data.layoutData) {
                setLayoutData(data.layoutData);
                setLayoutFileName(data.layoutFileName || 'layout.png');
            }

            // Restore spacing
            if (data.colSpacing !== undefined) setColSpacing(data.colSpacing);
            if (data.rowSpacing !== undefined) setRowSpacing(data.rowSpacing);

            // Note: User needs to re-upload audio file
            setAudioFileName(data.audioFileName || '');

            console.log('Project loaded');
            alert('Project loaded! Please re-upload the audio file: ' + (data.audioFileName || 'unknown'));

        } catch (err) {
            console.error('Failed to load project:', err);
            alert('Failed to load project: ' + err.message);
        }
    };

    return (
        <div className="editor-container">
            <header className="editor-header">
                <h2>🎵 Light Show Editor</h2>
                <div className="actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="btn-icon"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload Audio"
                    >
                        <Upload size={20} />
                    </button>
                    {audioFileName && (
                        <span style={{ fontSize: '12px', color: '#888', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {audioFileName}
                        </span>
                    )}

                    <button
                        className="btn-icon"
                        onClick={handleAnalyzeAudio}
                        disabled={!audioFile || isAnalyzing}
                        title="Analyze Audio (Add Beat Markers)"
                    >
                        <Wand2 size={20} />
                    </button>

                    <button
                        className="btn-icon"
                        onClick={handleSaveProject}
                        title="Save Project"
                        style={{ borderLeft: '1px solid #444', paddingLeft: '10px' }}
                    >
                        <Save size={20} />
                    </button>

                    <label
                        className="btn-icon"
                        title="Load Project"
                        style={{ cursor: 'pointer' }}
                    >
                        <Upload size={20} />
                        <input
                            type="file"
                            accept=".json"
                            onChange={(e) => e.target.files[0] && handleLoadProject(e.target.files[0])}
                            style={{ display: 'none' }}
                        />
                    </label>

                    {/* Layout Image Upload */}
                    <input
                        ref={layoutInputRef}
                        type="file"
                        accept="image/png"
                        onChange={handleLayoutUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        className="btn-icon"
                        onClick={() => layoutInputRef.current?.click()}
                        title="Upload Layout Image (PNG)"
                        style={{ borderLeft: '1px solid #444', paddingLeft: '10px' }}
                    >
                        <ImageIcon size={20} />
                    </button>
                    {layoutFileName && (
                        <span style={{ fontSize: '12px', color: '#888', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {layoutFileName}
                        </span>
                    )}

                    {/* Spacing Controls */}
                    <div className="spacing-config" style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Spacing:</span>
                        <input
                            type="number"
                            value={colSpacing}
                            onChange={e => setColSpacing(parseFloat(e.target.value) || 2.5)}
                            onBlur={handleSpacingChange}
                            style={{ width: '50px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="50"
                            step="0.5"
                            title="Column Spacing (X)"
                        />
                        <span style={{ color: '#666' }}>×</span>
                        <input
                            type="number"
                            value={rowSpacing}
                            onChange={e => setRowSpacing(parseFloat(e.target.value) || 6)}
                            onBlur={handleSpacingChange}
                            style={{ width: '50px', background: '#333', border: '1px solid #444', color: 'white', padding: '2px 5px', borderRadius: '3px' }}
                            min="1"
                            max="50"
                            step="0.5"
                            title="Row Spacing (Y)"
                        />
                    </div>

                    {/* View mode toggle */}
                    <div className="view-mode-toggle" style={{ display: 'flex', background: '#333', borderRadius: '4px', padding: '2px', marginLeft: '10px' }}>
                        <button
                            className={`toggle-btn ${viewMode === '2d' ? 'active' : ''}`}
                            onClick={() => setViewMode('2d')}
                            style={{
                                padding: '4px 8px',
                                border: 'none',
                                background: viewMode === '2d' ? '#e82020' : 'transparent',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >2D</button>
                        <button
                            className={`toggle-btn ${viewMode === '3d' ? 'active' : ''}`}
                            onClick={() => setViewMode('3d')}
                            style={{
                                padding: '4px 8px',
                                border: 'none',
                                background: viewMode === '3d' ? '#e82020' : 'transparent',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >3D</button>
                    </div>

                    <button className="btn-tesla-sm" onClick={handleExport}>
                        <Save size={16} /> Export
                    </button>
                </div>
            </header>

            <div className="editor-main">
                <div className="preview-panel">
                    {viewMode === '3d' ? (
                        <Scene3D
                            key={`${matrixConfig.rows}-${matrixConfig.cols}`}
                            matrixData={rendererRef.current.getMatrixFrame(currentTime, matrixConfig)}
                            rows={matrixConfig.rows}
                            cols={matrixConfig.cols}
                            layoutData={layoutData}
                            colSpacing={colSpacing}
                            rowSpacing={rowSpacing}
                        />
                    ) : (
                        <MatrixPreview2D
                            matrixData={rendererRef.current.getMatrixFrame(currentTime, matrixConfig)}
                            rows={matrixConfig.rows}
                            cols={matrixConfig.cols}
                            layoutData={layoutData}
                        />
                    )}
                </div>

                <div className="properties-panel">
                    {selectedClipId ? (
                        <ClipEditor
                            clip={selectedClip}
                            onChange={handleClipUpdate}
                            onDelete={handleClipDelete}
                            assets={project.assets}
                        />
                    ) : (
                        <div className="text-muted p-4">Select a clip to edit</div>
                    )}
                </div>
            </div>

            <div className="timeline-panel">
                <div className="timeline-controls">
                    <button onClick={togglePlay} className="btn-icon">
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <button onClick={handleReset} className="btn-icon" title="Reset to Start">
                        ⏮
                    </button>
                    <span className="time-display">{(currentTime / 1000).toFixed(2)}s</span>
                    <div className="control-group" style={{ marginLeft: '20px', display: 'flex', gap: '5px' }}>
                        <button onClick={handleAddTrack} className="btn-icon" title="Add Track">
                            <Layers size={20} /> <Plus size={10} style={{ marginLeft: -8, marginBottom: 8 }} />
                        </button>
                        <button onClick={handleAddClip} className="btn-icon" title="Add Clip at Cursor">
                            <Plus size={20} /> Clip
                        </button>
                    </div>
                </div>

                <div className="timeline-tracks-container">
                    <Timeline
                        project={project}
                        currentTime={currentTime}
                        duration={project.duration || 60000}
                        onClipSelect={setSelectedClipId}
                        selectedLayerId={selectedLayerId}
                        onLayerSelect={setSelectedLayerId}
                        onSeek={handleSeek}
                    />
                </div>
            </div>

            <audio
                ref={audioRef}
                src={audioUrlRef.current || ''}
                onEnded={() => setIsPlaying(false)}
                onError={(e) => console.error('Audio error:', e)}
                onLoadedData={() => console.log('Audio loaded successfully')}
            />

            <style jsx>{`
        .editor-container { display: flex; flex-direction: column; height: 100vh; background: #111; color: white; }
        .editor-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #222; border-bottom: 1px solid #333; }
        .editor-main { flex: 1; display: flex; overflow: hidden; }
        .preview-panel { flex: 2; background: #000; display: flex; align-items: center; justify-content: center; position: relative; }
        .properties-panel { flex: 1; min-width: 300px; background: #1a1a1a; border-left: 1px solid #333; overflow-y: auto; }
        .timeline-panel { height: 300px; background: #151515; border-top: 1px solid #333; display: flex; flex-direction: column; }
        .timeline-controls { padding: 10px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #333; }
        .timeline-tracks-container { flex: 1; overflow-y: auto; position: relative; }
        .btn-tesla-sm { background: #e82020; color: white; border: none; padding: 5px 15px; border-radius: 4px; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .btn-icon { background: transparent; border: none; color: white; cursor: pointer; padding: 5px; }
        .btn-icon:hover { color: #e82020; }
        .btn-icon.active { color: #e82020; }
        .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
        .text-muted { color: #888; }
      `}</style>
        </div>
    );
}
