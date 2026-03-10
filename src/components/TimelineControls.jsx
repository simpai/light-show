import React from 'react';
import { Play, Pause, Undo, Redo, SkipBack, Zap, ImageIcon, HelpCircle, Magnet, Plus, RotateCcw, Camera, Grid, AlignLeft, Music, Layers, Download, Upload, ChevronUp, ChevronDown, Activity, Volume2, VolumeX } from 'lucide-react';
import { PlayFromBookmarkIcon } from './PlayFromBookmarkIcon';

export function TimelineControls({
    isPlaying, togglePlay,
    bookmarks, handlePlayFromBookmark,
    handleReset,
    volume, setVolume,
    history, handleUndo,
    redoStack, handleRedo,
    handleTakeSnapshot, snapshot, handleRestoreSnapshot,
    selectedClipIds, handleRemoveGaps, handleAlignToSnap, snapMode, handleAlignClips,
    handleImportTimeline, handleAppendTimeline, handleExportTimeline,
    currentTime,
    zoom, setZoom,
    setSnapMode,
    bpm, setBpm, handleBpmChange,
    project, setProject, rendererRef,
    selectedLayerId,
    handleAddTrack, handleAddMidiTrack, handleAddClip, setShowHelpModal
}) {
    return (
        <div className="timeline-controls">
            <button onClick={togglePlay} className="btn-icon">
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={handlePlayFromBookmark} className="btn-icon" title="Play from Bookmark" disabled={bookmarks.length === 0}>
                <PlayFromBookmarkIcon size={22} />
            </button>
            <button onClick={handleReset} className="btn-icon" title="Reset to Start">
                <SkipBack size={24} />
            </button>

            <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px', background: '#222', padding: '2px 8px', borderRadius: '15px', border: '1px solid #333' }}>
                <button onClick={() => setVolume(v => v > 0 ? 0 : 1)} className="btn-icon" style={{ padding: '2px', color: volume === 0 ? '#888' : '#e2e8f0' }} title="Mute/Unmute">
                    {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    style={{ width: '60px', height: '4px' }}
                    title="Volume"
                />
            </div>

            <div className="history-controls" style={{ display: 'flex', gap: '5px', marginLeft: '10px', borderLeft: '1px solid #444', paddingLeft: '10px' }}>
                <button onClick={handleUndo} disabled={history.length === 0} className="btn-icon" title="Undo (Ctrl+Z)">
                    <Undo size={18} />
                </button>
                <button onClick={handleRedo} disabled={redoStack.length === 0} className="btn-icon" title="Redo (Ctrl+Y)">
                    <Redo size={18} />
                </button>

                <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />

                <button onClick={handleTakeSnapshot} className="btn-icon" title="Take Snapshot" style={{ marginLeft: '5px', color: '#4a90e2' }}>
                    <Camera size={18} />
                </button>
                <button onClick={handleRestoreSnapshot} disabled={!snapshot} className={`btn-icon ${!snapshot ? 'disabled' : ''}`} title="Restore Snapshot" style={{ color: '#e82020' }}>
                    <RotateCcw size={18} />
                </button>

                <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />

                <button onClick={handleRemoveGaps} disabled={selectedClipIds.length < 2} className="btn-icon" title="Remove Gaps" style={{ marginLeft: '5px', color: '#ffbb00' }}>
                    <Magnet size={18} />
                </button>
                <button onClick={handleAlignToSnap} disabled={selectedClipIds.length === 0 || snapMode === 'off'} className="btn-icon" title="Align to Snap" style={{ marginLeft: '5px', color: '#00ccff' }}>
                    <Grid size={18} />
                </button>
                <button onClick={handleAlignClips} disabled={selectedClipIds.length === 0} className="btn-icon" title="Align Tracks" style={{ marginLeft: '5px', color: '#00ff88' }}>
                    <AlignLeft size={18} />
                </button>

                <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />

                <label className="btn-icon" title="Import Timeline Data" style={{ marginLeft: '5px', color: '#ff77aa', cursor: 'pointer' }}>
                    <Upload size={18} />
                    <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                            if (e.target.files[0]) {
                                handleImportTimeline(e.target.files[0]);
                            }
                            e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                    />
                </label>
                <label className="btn-icon" title="Append To Timeline Data" style={{ marginLeft: '5px', color: '#ffaa44', cursor: 'pointer' }}>
                    <Plus size={18} />
                    <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                            if (e.target.files[0]) {
                                handleAppendTimeline(e.target.files[0]);
                            }
                            e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                    />
                </label>
                <button onClick={handleExportTimeline} className="btn-icon" title="Export Timeline Data" style={{ marginLeft: '5px', color: '#ff77aa' }}>
                    <Download size={18} />
                </button>

                <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />
            </div>
            <span className="time-display">{(currentTime / 1000).toFixed(2)}s</span>

            <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>Zoom:</span>
                <input
                    type="range"
                    min="10"
                    max="200"
                    value={zoom}
                    onChange={(e) => setZoom(parseInt(e.target.value))}
                    style={{ width: '80px' }}
                />
            </div>

            <div className="snap-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>Snap:</span>
                <select
                    value={snapMode}
                    onChange={(e) => setSnapMode(e.target.value)}
                    style={{
                        background: '#333',
                        border: '1px solid #444',
                        color: 'white',
                        padding: '2px 5px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                    }}
                >
                    <option value="1">1 Beat</option>
                    <option value="1/2">1/2 Beat</option>
                    <option value="1/4">1/4 Beat</option>
                    <option value="1/8">1/8 Beat</option>
                    <option value="off">Off</option>
                </select>
            </div>

            <div className="bpm-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>BPM:</span>
                <input
                    type="number"
                    value={bpm}
                    onChange={(e) => setBpm(e.target.value)}
                    onBlur={(e) => handleBpmChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleBpmChange(e.target.value)}
                    style={{
                        width: '50px',
                        background: '#333',
                        border: '1px solid #444',
                        color: 'white',
                        padding: '2px 5px',
                        borderRadius: '4px',
                        fontSize: '12px'
                    }}
                />
            </div>

            <div className="jitter-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>Jitter:</span>
                <input
                    type="number"
                    value={project.jitter || 0}
                    onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                        newProject.jitter = val;
                        setProject(newProject);
                        rendererRef.current.setProject(newProject);
                    }}
                    style={{
                        width: '50px',
                        background: '#333',
                        border: '1px solid #444',
                        color: 'white',
                        padding: '2px 5px',
                        borderRadius: '4px',
                        fontSize: '12px'
                    }}
                    min="0"
                    title="Jitter (ms)"
                />
                <span style={{ fontSize: '11px', color: '#666' }}>ms</span>
            </div>
            <div className="control-group" style={{ marginLeft: '20px', display: 'flex', gap: '5px' }}>
                <div style={{ display: 'flex', borderRight: '1px solid #333', paddingRight: '10px', marginRight: '5px' }}>
                    <button
                        onClick={() => {
                            if (!selectedLayerId) return;
                            const index = project.layers.findIndex(l => l.id === selectedLayerId);
                            if (index > 0) {
                                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                const temp = newProject.layers[index];
                                newProject.layers[index] = newProject.layers[index - 1];
                                newProject.layers[index - 1] = temp;
                                setProject(newProject);
                                rendererRef.current.setProject(newProject);
                            }
                        }}
                        className="btn-icon"
                        title="Move Track Up"
                        disabled={!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) <= 0}
                        style={{ color: (!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) <= 0) ? '#444' : '#fff' }}
                    >
                        <ChevronUp size={20} />
                    </button>
                    <button
                        onClick={() => {
                            if (!selectedLayerId) return;
                            const index = project.layers.findIndex(l => l.id === selectedLayerId);
                            if (index !== -1 && index < project.layers.length - 1) {
                                const newProject = Object.assign(Object.create(Object.getPrototypeOf(project)), project);
                                const temp = newProject.layers[index];
                                newProject.layers[index] = newProject.layers[index + 1];
                                newProject.layers[index + 1] = temp;
                                setProject(newProject);
                                rendererRef.current.setProject(newProject);
                            }
                        }}
                        className="btn-icon"
                        title="Move Track Down"
                        disabled={!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) >= project.layers.length - 1}
                        style={{ color: (!selectedLayerId || project.layers.findIndex(l => l.id === selectedLayerId) >= project.layers.length - 1) ? '#444' : '#fff' }}
                    >
                        <ChevronDown size={20} />
                    </button>
                </div>
                <button onClick={handleAddTrack} className="btn-icon" title="Add Track">
                    <Layers size={20} /> <Plus size={10} style={{ marginLeft: -8, marginBottom: 8 }} />
                </button>
                <button onClick={handleAddMidiTrack} className="btn-icon" title="Add Midi Track" style={{ color: '#a020f0' }}>
                    <Music size={20} /> <Plus size={10} style={{ marginLeft: -8, marginBottom: 8 }} />
                </button>
                <button onClick={() => handleAddClip('effect')} className="btn-icon" title="Add Effect at Cursor" style={{ color: '#e82020' }}>
                    <Zap size={20} /> Effect
                </button>
                <button onClick={() => handleAddClip('eq')} className="btn-icon" title="Add Equalizer at Cursor" style={{ color: '#6366f1' }}>
                    <Activity size={20} /> EQ
                </button>
                <button onClick={() => handleAddClip('gif')} className="btn-icon" title="Add GIF at Cursor" style={{ color: '#4a90e2' }}>
                    <ImageIcon size={20} /> GIF
                </button>
                <button onClick={() => setShowHelpModal(true)} className="btn-icon" title="Help / Shortcuts" style={{ marginLeft: '10px', color: '#888' }}>
                    <HelpCircle size={20} />
                </button>
            </div>
        </div>
    );
}
