import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Save, Plus, Layers, Settings, ArrowLeft, Grid3x3 } from 'lucide-react';
import { ProjectState } from '../core/ProjectState';
import { ShowRenderer } from '../core/ShowRenderer';
import { Timeline } from './Timeline';
import Visualizer from './Visualizer';
import MatrixPreview from './MatrixPreview';
import ClipEditor from './ClipEditor';
import axios from 'axios';

export default function Editor({ audioFile, analysis, onExit }) {
    const [project, setProject] = useState(new ProjectState());
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [selectedClipId, setSelectedClipId] = useState(null);
    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [matrixMode, setMatrixMode] = useState(false);
    const [matrixConfig, setMatrixConfig] = useState({ rows: 10, cols: 10 });

    const audioRef = useRef(null);
    const rendererRef = useRef(new ShowRenderer());
    const requestRef = useRef();

    // Initialize Project with Analysis
    useEffect(() => {
        if (analysis) {
            const newProject = new ProjectState();
            newProject.loadAnalysis(analysis);
            setProject(newProject);
            rendererRef.current.setProject(newProject);
            rendererRef.current.setMatrixMode(matrixMode, matrixConfig);
            // Auto-select first layer
            if (newProject.layers.length > 0) {
                setSelectedLayerId(newProject.layers[0].id);
            }
        }
    }, [analysis]);

    // Update renderer when matrix mode changes
    useEffect(() => {
        rendererRef.current.setMatrixMode(matrixMode, matrixConfig);
    }, [matrixMode, matrixConfig]);

    // Playback Loop
    const animate = () => {
        if (audioRef.current) {
            const time = audioRef.current.currentTime * 1000;
            setCurrentTime(time);
        }
        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        if (isPlaying) {
            audioRef.current?.play();
            requestRef.current = requestAnimationFrame(animate);
        } else {
            audioRef.current?.pause();
            cancelAnimationFrame(requestRef.current);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying]);

    const togglePlay = () => setIsPlaying(!isPlaying);

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
                    channels: [0, 1, 2, 3],
                    fadeIn: 0,
                    fadeOut: 0
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
                matrixMode: matrixMode,
                matrixConfig: matrixConfig
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

    return (
        <div className="editor-container">
            <header className="editor-header">
                <button onClick={onExit} className="btn-icon"><ArrowLeft size={20} /></button>
                <h2>Show Editor</h2>
                <div className="actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div className="matrix-toggle" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <button
                            className={`btn-icon ${matrixMode ? 'active' : ''}`}
                            onClick={() => setMatrixMode(!matrixMode)}
                            title="Toggle Matrix Mode"
                        >
                            <Grid3x3 size={20} />
                        </button>
                        {matrixMode && (
                            <div style={{ display: 'flex', gap: '5px', fontSize: '12px' }}>
                                <input
                                    type="number"
                                    value={matrixConfig.rows}
                                    onChange={(e) => setMatrixConfig({ ...matrixConfig, rows: parseInt(e.target.value) || 10 })}
                                    style={{ width: '40px', padding: '2px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '3px' }}
                                    min="1"
                                    max="20"
                                />
                                <span>×</span>
                                <input
                                    type="number"
                                    value={matrixConfig.cols}
                                    onChange={(e) => setMatrixConfig({ ...matrixConfig, cols: parseInt(e.target.value) || 10 })}
                                    style={{ width: '40px', padding: '2px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '3px' }}
                                    min="1"
                                    max="20"
                                />
                            </div>
                        )}
                    </div>
                    <button className="btn-tesla-sm" onClick={handleExport}>
                        <Save size={16} /> Export FSEQ
                    </button>
                </div>
            </header>

            <div className="editor-main">
                <div className="preview-panel">
                    {matrixMode ? (
                        <MatrixPreview
                            matrixData={rendererRef.current.getMatrixFrame(currentTime)}
                            rows={matrixConfig.rows}
                            cols={matrixConfig.cols}
                        />
                    ) : (
                        <div className="visualizer-placeholder">
                            <Visualizer frameData={rendererRef.current.getFrame(currentTime)} />
                        </div>
                    )}
                </div>

                <div className="properties-panel">
                    {selectedClipId ? (
                        <ClipEditor
                            clip={selectedClip}
                            onChange={handleClipUpdate}
                            onDelete={handleClipDelete}
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
                        duration={project.duration || 10000}
                        onClipSelect={setSelectedClipId}
                        selectedLayerId={selectedLayerId}
                        onLayerSelect={setSelectedLayerId}
                    />
                </div>
            </div>

            <audio
                ref={audioRef}
                src={audioFile ? URL.createObjectURL(audioFile) : null}
                onEnded={() => setIsPlaying(false)}
            />

            <style jsx>{`
        .editor-container { display: flex; flex-direction: column; height: 100vh; background: #111; color: white; }
        .editor-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #222; border-bottom: 1px solid #333; }
        .editor-main { flex: 1; display: flex; overflow: hidden; }
        .preview-panel { flex: 2; background: #000; display: flex; align-items: center; justify-content: center; position: relative; }
        .properties-panel { flex: 1; min-width: 300px; background: #1a1a1a; border-left: 1px solid #333; }
        .timeline-panel { height: 300px; background: #151515; border-top: 1px solid #333; display: flex; flex-direction: column; }
        .timeline-controls { padding: 10px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #333; }
        .timeline-tracks-container { flex: 1; overflow-y: auto; position: relative; }
        .btn-tesla-sm { background: #e82020; color: white; border: none; padding: 5px 15px; border-radius: 4px; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .btn-icon { background: transparent; border: none; color: white; cursor: pointer; padding: 5px; }
        .btn-icon:hover { color: #e82020; }
        .text-muted { color: #888; }
      `}</style>
        </div>
    );
}
