import React from 'react';
import { Trash2 } from 'lucide-react';

const CHANNELS = {
    "Main Beams": [0, 1],
    "Main Beams 2": [2, 3],
    "Signature": [4, 5],
    "Turn Signals": [12, 13],
    "Fog Lights": [14, 15],
    "Tail Lights": [25, 26],
    "Brake": [24],
    "Reverse": [22, 23]
};

const GifPreview = ({ asset, fps = 15 }) => {
    const canvasRef = React.useRef(null);
    const requestRef = React.useRef();
    const frameIndexRef = React.useRef(0);
    const lastTimeRef = React.useRef(0);

    // Reset on asset change
    React.useEffect(() => {
        frameIndexRef.current = 0;
        if (asset && canvasRef.current && asset.frames && asset.frames.length > 0) {
            const ctx = canvasRef.current.getContext('2d');
            canvasRef.current.width = asset.width;
            canvasRef.current.height = asset.height;
            ctx.putImageData(asset.frames[0], 0, 0);
        }
    }, [asset]);

    // Animation loop
    React.useEffect(() => {
        if (!asset || !asset.frames || asset.frames.length <= 1) return;

        const animate = (time) => {
            if (time - lastTimeRef.current > (1000 / (fps || 15))) { // Default fallback
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    frameIndexRef.current = (frameIndexRef.current + 1) % asset.frames.length;
                    ctx.putImageData(asset.frames[frameIndexRef.current], 0, 0);
                    lastTimeRef.current = time;
                }
            }
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [asset, fps]);

    // Calculate integer scale based on max height of 200px, capped at 4x
    const scale = React.useMemo(() => {
        if (!asset || !asset.height) return 1;
        const MAX_HEIGHT = 200;
        const s = Math.floor(MAX_HEIGHT / asset.height);
        return Math.min(Math.max(1, s), 4); // Min 1x, Max 4x
    }, [asset]);

    if (!asset) return null;

    return (
        <div className="gif-preview">
            <canvas
                ref={canvasRef}
                style={{
                    width: asset.width * scale,
                    height: asset.height * scale,
                    imageRendering: 'pixelated'
                }}
            />
            <div className="gif-info">
                {asset.width}x{asset.height} • {asset.frames.length} frames • {fps || '?'} FPS • {scale}x Zoom
            </div>
            <style>{`
                .gif-preview {
                    margin-top: 10px;
                    border: 1px solid #333;
                    background: #111;
                    border-radius: 4px;
                    overflow: hidden;
                    display: inline-flex;
                    flex-direction: column;
                    align-items: center; /* Center the canvas if it's smaller than info */
                }
                .gif-preview canvas {
                    max-width: 100%;
                    max-height: 200px;
                    display: block;
                    background-image: linear-gradient(45deg, #222 25%, transparent 25%), 
                                      linear-gradient(-45deg, #222 25%, transparent 25%), 
                                      linear-gradient(45deg, transparent 75%, #222 75%), 
                                      linear-gradient(-45deg, transparent 75%, #222 75%);
                    background-size: 20px 20px;
                    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                }
                .gif-info {
                    width: 100%;
                    padding: 4px 8px;
                    background: #222;
                    font-size: 11px;
                    color: #999;
                    border-top: 1px solid #333;
                    text-align: center;
                    box-sizing: border-box;
                }
            `}</style>
        </div>
    );
};

export default function ClipEditor({ clip, onChange, onDelete, assets = {}, lightGroups = {}, carGroups = [], allCarsThumbnail = null }) {
    if (!clip) return <div className="p-4 text-gray-500">No clip selected</div>;

    const handleChange = (field, value) => {
        onChange({ ...clip, [field]: value });
    };

    const calculateDuration = (mode, updatedClip) => {
        const asset = updatedClip.assetId ? assets[updatedClip.assetId] : null;
        const frameCount = asset?.frames?.length || 1;
        const repetitions = updatedClip.repetitions || 1;

        let duration = updatedClip.duration || 1000;

        if (mode === 'frame') {
            const frameDuration = updatedClip.frameDuration || 100;
            duration = frameDuration * frameCount * repetitions;
        } else if (mode === 'beat') {
            const bpm = updatedClip.bpm || 120;
            const beatsPerFrame = updatedClip.beatsPerFrame || 1;
            const msPerBeat = 60000 / bpm;
            const frameDuration = msPerBeat * beatsPerFrame;
            duration = frameDuration * frameCount * repetitions;
        }

        return Math.round(duration);
    };

    const toggleLightGroup = (groupName) => {
        const current = new Set(clip.targetLightGroups || []);

        // Migration/Compatibility: If we're starting to use targetLightGroups, 
        // we might want to preserve the old 'channels' for the first time, 
        // but the goal is to shift entirely to symbolic names for UI state.
        if (current.has(groupName)) {
            current.delete(groupName);
        } else {
            current.add(groupName);
        }

        const nextGroups = Array.from(current);

        // Update both to maintain partial backward compatibility during the transition,
        // but the renderer will prioritize targetLightGroups if present.
        handleChange('targetLightGroups', nextGroups);
    };

    // Use provided lightGroups or fall back to default grouping
    const displayGroups = Object.keys(lightGroups).length > 0
        ? lightGroups
        : {
            "Main Beams": { channels: [0, 1] },
            "Main Beams 2": { channels: [2, 3] },
            "Signature": { channels: [4, 5] },
            "Turn Signals": { channels: [12, 13] },
            "Fog Lights": { channels: [14, 15] },
            "Tail Lights": { channels: [25, 26] },
            "Brake": { channels: [24] },
            "Reverse": { channels: [22, 23] }
        };

    return (
        <div className="clip-editor">
            <div className="header">
                <h3>Edit Clip</h3>
                <button onClick={() => onDelete(clip.id)} className="delete-btn">
                    <Trash2 size={18} />
                </button>
            </div>

            <div className="section-container">
                <label className="section-title">Timing</label>
                <div className="form-group grid-2">
                    <div className="input-group-compact">
                        <label className="compact-label">Start Time</label>
                        <div className="input-with-hint">
                            <input
                                type="number"
                                value={Number((clip.startTime || 0).toFixed(2))}
                                step="0.01"
                                onChange={e => handleChange('startTime', parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
                            />
                            <span className="unit-hint">{(clip.startTime / 1000).toFixed(2)}s</span>
                        </div>
                    </div>

                    <div className="input-group-compact">
                        <label className="compact-label">Duration</label>
                        <div className="input-with-hint">
                            <input
                                type="number"
                                value={Number((clip.duration || 0).toFixed(2))}
                                step="0.01"
                                onChange={e => handleChange('duration', parseFloat(parseFloat(e.target.value).toFixed(2)) || 0)}
                            />
                            <span className="unit-hint">{(clip.duration / 1000).toFixed(2)}s</span>
                        </div>
                    </div>
                </div>

                {clip.type === 'gif' && (
                    <div className="form-group grid-2" style={{ marginTop: '8px' }}>
                        <div className="input-group-compact">
                            <label className="compact-label">BPM</label>
                            <input
                                type="number"
                                value={clip.bpm || 120}
                                onChange={e => {
                                    const bpm = parseFloat(e.target.value);
                                    const updatedClip = { ...clip, bpm, timingMode: 'beat' };
                                    const duration = calculateDuration('beat', updatedClip);
                                    onChange({ ...updatedClip, duration });
                                }}
                                min="1"
                                step="0.1"
                            />
                        </div>
                        <div className="input-group-compact">
                            <label className="compact-label">Beats/Frame</label>
                            <input
                                type="number"
                                value={clip.beatsPerFrame || 1}
                                onChange={e => {
                                    const beatsPerFrame = parseFloat(e.target.value);
                                    const updatedClip = { ...clip, beatsPerFrame, timingMode: 'beat' };
                                    const duration = calculateDuration('beat', updatedClip);
                                    onChange({ ...updatedClip, duration });
                                }}
                                min="0.125"
                                step="0.125"
                            />
                        </div>
                    </div>
                )}
            </div>

            {clip.type === 'effect' && (
                <>
                    <div className="section-container">
                        <label className="section-title">Effect Style</label>
                        <div className="form-group">
                            <label className="compact-label" style={{ minWidth: '80px' }}>Style</label>
                            <select
                                value={clip.effectType || 'flash'}
                                onChange={e => handleChange('effectType', e.target.value)}
                            >
                                <option value="flash">Flash (Hold)</option>
                                <option value="pulse">Pulse (Sine)</option>
                                <option value="strobe">Strobe</option>
                            </select>
                        </div>

                        {(clip.effectType === 'pulse' || clip.effectType === 'strobe') && (
                            <div className="form-group">
                                <label className="compact-label" style={{ minWidth: '80px' }}>Speed</label>
                                <div className="slider-with-val" style={{ flex: 1 }}>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="10"
                                        step="0.5"
                                        value={clip.speed || 1}
                                        onChange={e => handleChange('speed', parseFloat(e.target.value))}
                                    />
                                    <span className="val-hint">{(clip.speed || 1).toFixed(1)}Hz</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="section-container">
                        <label className="section-title">Pattern</label>
                        <div className="form-group">
                            <label className="compact-label" style={{ minWidth: '80px' }}>Type</label>
                            <select
                                value={clip.pattern || 'uniform'}
                                onChange={e => handleChange('pattern', e.target.value)}
                            >
                                <option value="uniform">Uniform</option>
                                <option value="wave">Wave</option>
                                <option value="sequential">Sequential</option>
                                <option value="radial">Radial</option>
                            </select>
                        </div>

                        {clip.pattern && clip.pattern !== 'uniform' && (
                            <>
                                <div className="form-group">
                                    <label className="compact-label" style={{ minWidth: '80px' }}>Dir</label>
                                    <select
                                        value={clip.patternDirection || 'horizontal'}
                                        onChange={e => handleChange('patternDirection', e.target.value)}
                                    >
                                        {clip.pattern === 'wave' && (
                                            <>
                                                <option value="horizontal">Horizontal</option>
                                                <option value="vertical">Vertical</option>
                                                <option value="diagonal-right">↘</option>
                                                <option value="diagonal-left">↙</option>
                                            </>
                                        )}
                                        {clip.pattern === 'sequential' && (
                                            <>
                                                <option value="row-by-row">Row</option>
                                                <option value="col-by-col">Col</option>
                                            </>
                                        )}
                                        {clip.pattern === 'radial' && (
                                            <>
                                                <option value="outward">Outward</option>
                                                <option value="inward">Inward</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="compact-label" style={{ minWidth: '80px' }}>Speed</label>
                                    <div className="slider-with-val" style={{ flex: 1 }}>
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="5"
                                            step="0.1"
                                            value={clip.patternSpeed || 1}
                                            onChange={e => handleChange('patternSpeed', parseFloat(e.target.value))}
                                        />
                                        <span className="val-hint">{(clip.patternSpeed || 1).toFixed(1)}x</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="section-container content-box">
                        <label className="section-title">Target Light Groups</label>
                        <div className="channels-list">
                            {Object.entries(displayGroups).map(([label, groupData]) => {
                                const isChecked = (clip.targetLightGroups || []).includes(label);
                                return (
                                    <label key={label} className="channel-item">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleLightGroup(label)}
                                        />
                                        <span>{label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className="section-container content-box">
                        <div className="ramping-header-row">
                            <div className="toggle-group-inline">
                                <input
                                    id="ramping-toggle"
                                    type="checkbox"
                                    className="toggle-checkbox"
                                    checked={clip.rampingEnabled || false}
                                    onChange={e => {
                                        const enabled = e.target.checked;
                                        if (enabled) {
                                            onChange({
                                                ...clip,
                                                rampingEnabled: true,
                                                rampOnDuration: clip.rampOnDuration || 500,
                                                rampOffDuration: clip.rampOffDuration || 500
                                            });
                                        } else {
                                            handleChange('rampingEnabled', false);
                                        }
                                    }}
                                />
                                <label htmlFor="ramping-toggle" className="section-title-inline">Ramping</label>
                            </div>
                            {clip.rampingEnabled && (
                                <div className="ramping-info-inline">
                                    {(() => {
                                        const rampOnDur = (clip.rampOnEnabled !== false) ? (clip.rampOnDuration || 0) : 0;
                                        const rampOffDur = (clip.rampOffEnabled !== false) ? (clip.rampOffDuration || 0) : 0;
                                        const maxDur = clip.duration - rampOnDur - rampOffDur;

                                        if (maxDur < 0) {
                                            return <span className="error-text">⚠️ Overlap: {Math.abs(maxDur).toFixed(0)}ms</span>;
                                        }
                                        return (
                                            <span className="info-text">
                                                FULL: <span className="highlight">{(maxDur / 1000).toFixed(2)}s</span>
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {clip.rampingEnabled && (
                            <div className="ramping-controls-horizontal">
                                <div className="ramping-row">
                                    <label className="ramp-label-inline">
                                        <input
                                            type="checkbox"
                                            checked={clip.rampOnEnabled !== false}
                                            onChange={e => handleChange('rampOnEnabled', e.target.checked)}
                                        />
                                        ON
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="3000"
                                        step="100"
                                        value={clip.rampOnDuration || 500}
                                        onChange={e => handleChange('rampOnDuration', parseInt(e.target.value))}
                                        disabled={clip.rampOnEnabled === false}
                                        className="ramp-slider"
                                    />
                                    <span className="ramp-val-hint">{(clip.rampOnDuration || 500).toFixed(0)}ms</span>
                                </div>

                                <div className="ramping-row">
                                    <label className="ramp-label-inline">
                                        <input
                                            type="checkbox"
                                            checked={clip.rampOffEnabled !== false}
                                            onChange={e => handleChange('rampOffEnabled', e.target.checked)}
                                        />
                                        OFF
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="3000"
                                        step="100"
                                        value={clip.rampOffDuration || 500}
                                        onChange={e => handleChange('rampOffDuration', parseInt(e.target.value))}
                                        disabled={clip.rampOffEnabled === false}
                                        className="ramp-slider"
                                    />
                                    <span className="ramp-val-hint">{(clip.rampOffDuration || 500).toFixed(0)}ms</span>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {clip.type === 'gif' && (
                <div className="section-container content-box">
                    <label className="section-title">Preview</label>
                    {clip.assetId && assets[clip.assetId] ? (
                        <GifPreview asset={assets[clip.assetId]} fps={clip.fps || 15} />
                    ) : (
                        <div className="text-gray-500 text-sm p-2">No asset loaded</div>
                    )}
                </div>
            )}

            <div className="section-container content-box car-selection-box">
                <label className="section-title">Target Car Group</label>
                <div className="group-grid">
                    <button
                        className={`group-grid-item ${!clip.carGroupId ? 'active' : ''}`}
                        onClick={() => handleChange('carGroupId', '')}
                    >
                        <img src={allCarsThumbnail} alt="ALL" className="all-cars-icon" />
                        <span>ALL</span>
                    </button>
                    {carGroups.map(group => (
                        <button
                            key={group.id}
                            className={`group-grid-item ${clip.carGroupId === group.id ? 'active' : ''}`}
                            onClick={() => handleChange('carGroupId', group.id)}
                        >
                            <img src={group.thumbnail} alt={group.name} />
                            <span>{group.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            <style>{`
                .clip-editor {
                    padding: 12px 6px;
                    font-size: 14px;
                    color: white;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #333;
                }

                .header h3 {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 0;
                    color: white;
                }

                .delete-btn {
                    background: none;
                    border: none;
                    color: #ef4444;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 4px;
                    transition: all 0.2s;
                }

                .delete-btn:hover {
                    background: #2a2a2a;
                    color: #dc2626;
                }

                .form-group {
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    box-sizing: border-box;
                }

                .form-group label {
                    flex-shrink: 0;
                    min-width: 120px;
                    margin-bottom: 0;
                    font-size: 13px;
                    font-weight: 500;
                    color: #d1d5db;
                }

                .form-group input[type="number"],
                .form-group input[type="text"],
                .form-group select {
                    flex: 1;
                    min-width: 0;
                    width: 100%;
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 6px;
                    padding: 6px 10px;
                    color: white;
                    font-size: 13px;
                    outline: none;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }

                .form-group input:focus,
                .form-group select:focus {
                    border-color: #e82020;
                }

                .section-container {
                    margin-bottom: 12px;
                }

                .content-box {
                    background: #111;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 10px;
                }

                .section-title {
                    display: block;
                    font-size: 11px;
                    font-weight: 700;
                    color: #888;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .section-title-inline {
                    font-size: 11px;
                    font-weight: 600;
                    color: #888;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .timing-section {
                    background: #1a1a1a;
                    border: 1px solid rgba(232, 32, 32, 0.3);
                    border-radius: 8px;
                    padding: 10px 12px;
                    margin-bottom: 12px;
                }

                .compact-label {
                    font-size: 11px;
                    color: #888;
                    margin-bottom: 4px;
                    display: block;
                    text-transform: uppercase;
                }

                .input-group-compact {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                }

                .grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }

                .slider-with-val {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .val-hint {
                    font-size: 12px;
                    color: #e82020;
                    min-width: 40px;
                    text-align: right;
                }

                .highlight {
                    color: #e82020;
                    font-weight: 500;
                }

                .channels-list {
                    max-height: 160px;
                    overflow-y: auto;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0;
                }

                .channel-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0;
                    cursor: pointer;
                    transition: opacity 0.2s;
                }

                .channel-item:hover {
                    opacity: 0.8;
                }

                .channel-item span {
                    font-size: 13px;
                    color: #d1d5db;
                }

                .ramping-header-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }

                .toggle-group-inline {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .ramping-controls-horizontal {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding-top: 4px;
                }

                .ramping-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .ramp-label-inline {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #d1d5db;
                    min-width: 50px;
                }

                .ramp-slider {
                    flex: 1;
                }

                .ramp-val-hint {
                    font-size: 11px;
                    font-weight: 600;
                    color: #e82020;
                    min-width: 45px;
                    text-align: right;
                }

                .toggle-checkbox {
                    width: auto !important;
                    margin: 0;
                }

                .ramping-info-inline {
                    background: rgba(255, 255, 255, 0.08);
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                }

                .input-with-hint {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .unit-hint {
                    font-size: 11px;
                    color: #888;
                    min-width: 40px;
                }

                .error-text {
                    color: #ef4444;
                    font-weight: 600;
                }

                .group-selection-section {
                    margin-top: 16px;
                    padding-top: 12px;
                    border-top: 1px solid #333;
                }

                .group-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 6px;
                }

                .group-grid-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    background: #111;
                    border: 1px solid #333;
                    border-radius: 6px;
                    padding: 4px; /* Reduced from 8px */
                    cursor: pointer;
                    transition: all 0.2s;
                    min-width: 0;
                }

                .group-grid-item:hover {
                    border-color: #555;
                    background: #222;
                }

                .group-grid-item.active {
                    border-color: #e82020;
                    background: rgba(232, 32, 32, 0.1);
                }

                .group-grid-item img {
                    width: 100%;
                    aspect-ratio: 63 / 32;
                    object-fit: cover; /* Changed from contain to maximize size */
                    border-radius: 3px;
                    background: #000;
                }

                .all-cars-icon {
                    width: 100%;
                    aspect-ratio: 63 / 32;
                    object-fit: cover;
                    border-radius: 3px;
                    background: #000;
                    border: 1px solid #333;
                }

                .group-grid-item span {
                    font-size: 9px; /* Reduced for more space */
                    font-weight: 600;
                    color: #777;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                    margin-top: 2px;
                }

                .group-grid-item.active span {
                    color: white;
                    font-weight: 600;
                }
            `}</style>
        </div>
    );
}
