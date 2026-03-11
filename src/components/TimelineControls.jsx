import React from 'react';
import { useStore } from '../store/useStore';
import { Play, Pause, Undo, Redo, SkipBack, Zap, ImageIcon, HelpCircle, Magnet, Plus, Grid, AlignLeft, Music, Layers, Download, Upload, ChevronUp, ChevronDown, Activity, Volume2, VolumeX } from 'lucide-react';
import { PlayFromBookmarkIcon } from './PlayFromBookmarkIcon';

function Slider({ value, onChange, min, max, step, title }) {
    return <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '60px', height: '4px' }}
        title="Volume"
    />
}
function Bar() {
    return <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 5px', alignSelf: 'center' }} />
}
function TimeDisplay() {
    const currentTime = useStore(state => state.currentTime);
    return <span className="time-display">{(currentTime / 1000).toFixed(2)}s</span>;
}

export function TimelineControls({
    isPlaying, togglePlay,
    bookmarks, handlePlayFromBookmark,
    handleReset,
    volume, setVolume,
    history, handleUndo,
    redoStack, handleRedo,
    selectedClipIds, handleRemoveGaps, handleAlignToSnap, snapMode, handleAlignClips,
    handleImportTimeline, handleAppendTimeline, handleExportTimeline,
    zoom, setZoom,
    setSnapMode,
    bpm, setBpm, handleBpmChange,
    project, setProject, rendererRef,
    selectedLayerId,
    handleAddTrack, handleAddMidiTrack, handleAddClip, setShowHelpModal
}) {

    return (
        <div className="timeline-controls">
            <TimeDisplay />
            <button onClick={togglePlay} className="btn-icon">
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={handlePlayFromBookmark} className="btn-icon" title="Play from Bookmark" disabled={bookmarks.length === 0}>
                <PlayFromBookmarkIcon size={22} />
            </button>
            <button onClick={handleReset} className="btn-icon" title="Reset to Start">
                <SkipBack size={24} />
            </button>

            <span style={{ fontSize: '12px', color: '#666' }}>Jitter(ms):</span>
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
                    padding: '2px 3px',
                    borderRadius: '4px',
                    fontSize: '12px'
                }}
                min="0"
                title="Jitter (ms)"
            />

            <div className="volume-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px', padding: '2px 8px', }}>
                <button onClick={() => setVolume(v => v > 0 ? 0 : 1)} className="btn-icon" style={{ padding: '2px', color: volume === 0 ? '#888' : '#e2e8f0' }} title="Mute/Unmute">
                    {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <Slider
                    value={volume}
                    onChange={setVolume}
                    min={0}
                    max={1}
                    step={0.01}
                    title="Volume"
                />
            </div>

            <Bar />

            <button onClick={handleUndo} disabled={history.length === 0} className="btn-icon" title="Undo (Ctrl+Z)">
                <Undo size={18} />
            </button>
            <button onClick={handleRedo} disabled={redoStack.length === 0} className="btn-icon" title="Redo (Ctrl+Y)">
                <Redo size={18} />
            </button>
            <Bar />
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



            <button onClick={handleRemoveGaps} disabled={selectedClipIds.length < 2} className="btn-icon" title="Remove Gaps" style={{ marginLeft: '5px', color: '#ffbb00' }}>
                <Magnet size={18} />
            </button>
            <button onClick={handleAlignToSnap} disabled={selectedClipIds.length === 0 || snapMode === 'off'} className="btn-icon" title="Align to Snap" style={{ marginLeft: '5px', color: '#00ccff' }}>
                <Grid size={18} />
            </button>
            <button onClick={handleAlignClips} disabled={selectedClipIds.length === 0} className="btn-icon" title="Align Tracks" style={{ marginLeft: '5px', color: '#00ff88' }}>
                <AlignLeft size={18} />
            </button>

            <Bar />

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
            <Bar />

            {/* <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '0px' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>Zoom:</span>
                <input
                    type="range"
                    min="10"
                    max="200"
                    value={zoom}
                    onChange={(e) => setZoom(parseInt(e.target.value))}
                    style={{ width: '80px' }}
                />
            </div> */}

            <div className="control-group" style={{ marginLeft: '20px', display: 'flex', gap: '5px' }}>
                <button onClick={handleAddTrack} className="btn-icon" title="Add Track" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px', padding: '2px 4px' }}>
                    <Layers size={18} />
                    <span style={{ fontSize: '7px', fontWeight: '900', marginTop: '0px' }}>TRACK</span>
                </button>
                <button onClick={handleAddMidiTrack} className="btn-icon" title="Add Midi Track" style={{ color: '#a020f0', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px', padding: '2px 4px' }}>
                    <Layers size={18} />
                    <span style={{ fontSize: '7px', fontWeight: '900', marginTop: '0px' }}>MIDI</span>
                </button>
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
                <Bar />
                <button onClick={() => handleAddClip('effect')} className="btn-icon" title="Add Effect at Cursor" style={{ color: '#e82020', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px', padding: '2px 4px' }}>
                    <Zap size={18} />
                    <span style={{ fontSize: '8px', fontWeight: '900', marginTop: '-2px' }}>FX</span>
                </button>
                <button onClick={() => handleAddClip('eq')} className="btn-icon" title="Add Equalizer at Cursor" style={{ color: '#6366f1', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px', padding: '2px 4px' }}>
                    <Activity size={18} />
                    <span style={{ fontSize: '8px', fontWeight: '900', marginTop: '-2px' }}>EQ</span>
                </button>
                <button onClick={() => handleAddClip('gif')} className="btn-icon" title="Add GIF at Cursor" style={{ color: '#4a90e2', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '32px', padding: '2px 4px' }}>
                    <ImageIcon size={18} />
                    <span style={{ fontSize: '8px', fontWeight: '900', marginTop: '-2px' }}>GIF</span>
                </button>
                <button onClick={() => setShowHelpModal(true)} className="btn-icon" title="Help / Shortcuts" style={{ marginLeft: '10px', color: '#888' }}>
                    <HelpCircle size={20} />
                </button>
            </div>
        </div>
    );
}
