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

const GifPreview = ({ asset }) => {
    const canvasRef = React.useRef(null);

    React.useEffect(() => {
        if (asset && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            // Keep canvas size reasonable for preview
            canvasRef.current.width = asset.width;
            canvasRef.current.height = asset.height;

            // Draw first frame
            if (asset.frames && asset.frames.length > 0) {
                ctx.putImageData(asset.frames[0], 0, 0);
            }
        }
    }, [asset]);

    if (!asset) return null;

    return (
        <div className="gif-preview">
            <canvas ref={canvasRef} />
            <div className="gif-info">
                {asset.width}x{asset.height} • {asset.frames.length} frames
            </div>
            <style jsx>{`
                .gif-preview {
                    margin-top: 10px;
                    border: 1px solid #333;
                    background: #111;
                    border-radius: 4px;
                    overflow: hidden;
                    display: inline-flex;
                    flex-direction: column;
                }
                canvas {
                    max-width: 100%;
                    max-height: 200px;
                    width: auto;
                    height: auto;
                    display: block;
                    background-image: linear-gradient(45deg, #222 25%, transparent 25%), 
                                      linear-gradient(-45deg, #222 25%, transparent 25%), 
                                      linear-gradient(45deg, transparent 75%, #222 75%), 
                                      linear-gradient(-45deg, transparent 75%, #222 75%);
                    background-size: 20px 20px;
                    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
                }
                .gif-info {
                    padding: 4px 8px;
                    background: #222;
                    font-size: 11px;
                    color: #999;
                    border-top: 1px solid #333;
                    text-align: center;
                }
            `}</style>
        </div>
    );
};

export default function ClipEditor({ clip, onChange, onDelete, assets = {} }) {
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

    const toggleChannel = (groupChannels) => {
        const current = new Set(clip.channels || []);
        const allPresent = groupChannels.every(c => current.has(c));

        if (allPresent) {
            groupChannels.forEach(c => current.delete(c));
        } else {
            groupChannels.forEach(c => current.add(c));
        }
        handleChange('channels', Array.from(current));
    };

    return (
        <div className="clip-editor">
            <div className="header">
                <h3>Edit Clip</h3>
                <button onClick={() => onDelete(clip.id)} className="delete-btn">
                    <Trash2 size={18} />
                </button>
            </div>

            <div className="form-group">
                <label>Clip Type</label>
                <select
                    value={clip.type || 'effect'}
                    onChange={e => handleChange('type', e.target.value)}
                >
                    <option value="effect">Effect (Lights)</option>
                    <option value="gif">GIF (Image/GIF)</option>
                </select>
            </div>

            <div className="form-group">
                <label>Start Time (ms)</label>
                <input
                    type="number"
                    value={clip.startTime}
                    onChange={e => handleChange('startTime', parseInt(e.target.value))}
                />
            </div>

            {clip.type === 'gif' ? (
                <div className="timing-section">
                    {/* Beat-based timing only for GIF clips */}
                    <div className="form-group">
                        <label>BPM</label>
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
                    <div className="form-group">
                        <label>Beats per Frame</label>
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
                    <div className="form-group">
                        <label>Repetitions</label>
                        <input
                            type="number"
                            value={clip.repetitions || 1}
                            onChange={e => {
                                const repetitions = parseInt(e.target.value);
                                const updatedClip = { ...clip, repetitions, timingMode: 'beat' };
                                const duration = calculateDuration('beat', updatedClip);
                                onChange({ ...updatedClip, duration });
                            }}
                            min="1"
                        />
                    </div>
                    <div className="info-box">
                        <span className="info-icon">ℹ️</span>
                        <span className="info-text">
                            Frame duration: <span className="highlight">{clip.bpm ? ((60000 / clip.bpm) * (clip.beatsPerFrame || 1)).toFixed(1) : 0}ms</span>
                        </span>
                    </div>
                    <div className="info-box">
                        <span className="info-icon">ℹ️</span>
                        <span className="info-text">
                            Total duration: <span className="highlight">{clip.duration}ms</span> ({(clip.duration / 1000).toFixed(2)}s)
                        </span>
                    </div>
                </div>
            ) : (
                <div className="form-group">
                    <label>Duration (ms)</label>
                    <input
                        type="number"
                        value={clip.duration}
                        onChange={e => handleChange('duration', parseInt(e.target.value))}
                    />
                </div>
            )}

            {clip.type === 'effect' && (
                <>
                    <div className="form-group">
                        <label>Effect Style</label>
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
                            <label>Speed (Hz) - {clip.speed || 1} cycles/sec</label>
                            <input
                                type="range"
                                min="0.5"
                                max="10"
                                step="0.5"
                                value={clip.speed || 1}
                                onChange={e => handleChange('speed', parseFloat(e.target.value))}
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Pattern Type</label>
                        <select
                            value={clip.pattern || 'uniform'}
                            onChange={e => handleChange('pattern', e.target.value)}
                        >
                            <option value="uniform">Uniform (All at once)</option>
                            <option value="wave">Wave</option>
                            <option value="sequential">Sequential</option>
                            <option value="radial">Radial</option>
                        </select>
                    </div>

                    {clip.pattern && clip.pattern !== 'uniform' && (
                        <>
                            <div className="form-group">
                                <label>Direction</label>
                                <select
                                    value={clip.patternDirection || 'horizontal'}
                                    onChange={e => handleChange('patternDirection', e.target.value)}
                                >
                                    {clip.pattern === 'wave' && (
                                        <>
                                            <option value="horizontal">Horizontal (Left to Right)</option>
                                            <option value="vertical">Vertical (Top to Bottom)</option>
                                            <option value="diagonal-right">Diagonal ↘</option>
                                            <option value="diagonal-left">Diagonal ↙</option>
                                        </>
                                    )}
                                    {clip.pattern === 'sequential' && (
                                        <>
                                            <option value="row-by-row">Row by Row</option>
                                            <option value="col-by-col">Column by Column</option>
                                        </>
                                    )}
                                    {clip.pattern === 'radial' && (
                                        <>
                                            <option value="outward">Outward (Center to Edge)</option>
                                            <option value="inward">Inward (Edge to Center)</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Pattern Speed - {(clip.patternSpeed || 1).toFixed(1)}x</label>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="5"
                                    step="0.1"
                                    value={clip.patternSpeed || 1}
                                    onChange={e => handleChange('patternSpeed', parseFloat(e.target.value))}
                                />
                            </div>
                        </>
                    )}

                    <div className="form-group vertical-group">
                        <label>Target Lights</label>
                        <div className="channels-list">
                            {Object.entries(CHANNELS).map(([label, groupChs]) => {
                                const isChecked = groupChs.every(c => (clip.channels || []).includes(c));
                                return (
                                    <label key={label} className="channel-item">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleChannel(groupChs)}
                                        />
                                        <span>{label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {clip.type === 'gif' && (
                <div className="pattern-section">
                    <div className="form-group vertical-group">
                        <label>Upload Image/GIF</label>
                        <input
                            type="file"
                            accept="image/gif,image/png,image/jpeg,image/jpg"
                            onChange={(e) => {
                                if (e.target.files[0] && onChange) {
                                    const event = new CustomEvent('imageUpload', {
                                        detail: { clipId: clip.id, file: e.target.files[0] }
                                    });
                                    window.dispatchEvent(event);
                                }
                            }}
                            className="file-input"
                        />
                        {clip.assetId && assets[clip.assetId] && (
                            <GifPreview asset={assets[clip.assetId]} />
                        )}
                    </div>

                    <div className="form-group">
                        <label>Brightness Mode</label>
                        <select
                            value={clip.brightnessMode || 'gradient'}
                            onChange={e => handleChange('brightnessMode', e.target.value)}
                        >
                            <option value="gradient">Gradient (0-255)</option>
                            <option value="binary">Binary (ON/OFF)</option>
                        </select>
                    </div>

                    {clip.brightnessMode === 'binary' && (
                        <div className="form-group">
                            <label>Threshold - {clip.brightnessThreshold || 128}</label>
                            <input
                                type="range"
                                min="0"
                                max="255"
                                step="1"
                                value={clip.brightnessThreshold || 128}
                                onChange={e => handleChange('brightnessThreshold', parseInt(e.target.value))}
                            />
                        </div>
                    )}
                </div>
            )}

            <style jsx>{`
                .clip-editor {
                    padding: 16px;
                    font-size: 14px;
                    color: white;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 12px;
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
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .form-group label {
                    flex-shrink: 0;
                    min-width: 120px;
                    margin-bottom: 0;
                    font-size: 13px;
                    font-weight: 500;
                    color: #d1d5db;
                    text-align: right;
                }

                .form-group input[type="number"],
                .form-group input[type="text"],
                .form-group select {
                    flex: 1;
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 6px;
                    padding: 6px 10px;
                    color: white;
                    font-size: 13px;
                    outline: none;
                    transition: border-color 0.2s;
                }

                .form-group input:focus,
                .form-group select:focus {
                    border-color: #e82020;
                }

                .vertical-group {
                    flex-direction: column;
                    align-items: stretch;
                }

                .vertical-group label {
                    text-align: left;
                    margin-bottom: 8px;
                }

                .timing-section {
                    background: #1a1a1a;
                    border: 1px solid rgba(232, 32, 32, 0.3);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }

                .timing-select {
                    border-color: rgba(232, 32, 32, 0.5) !important;
                }

                .grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-bottom: 12px;
                }

                .info-box {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: #252525;
                    border: 1px solid #333;
                    border-radius: 6px;
                    padding: 10px 12px;
                    margin-bottom: 8px;
                }

                .info-icon {
                    font-size: 14px;
                    color: #9ca3af;
                }

                .info-text {
                    font-size: 13px;
                    color: #d1d5db;
                }

                .highlight {
                    color: #e82020;
                    font-weight: 500;
                }

                .pattern-section {
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }

                .file-input {
                    width: 100%;
                    font-size: 12px;
                    color: white;
                    padding: 8px;
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 6px;
                    cursor: pointer;
                }

                .file-input::-webkit-file-upload-button {
                    background: #e82020;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-right: 12px;
                }

                .file-input::-webkit-file-upload-button:hover {
                    background: #c01818;
                }

                .success-text {
                    font-size: 12px;
                    color: #10b981;
                    margin-top: 8px;
                }

                .channels-list {
                    max-height: 160px;
                    overflow-y: auto;
                    border: 1px solid #333;
                    border-radius: 6px;
                    padding: 8px;
                    background: #1a1a1a;
                }

                .channel-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 8px;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: background 0.2s;
                }

                .channel-item:hover {
                    background: #222;
                }

                .channel-item input[type="checkbox"] {
                    width: auto;
                    cursor: pointer;
                }

                .channel-item span {
                    font-size: 13px;
                    color: #d1d5db;
                }

                input[type="range"] {
                    width: 100%;
                    cursor: pointer;
                }
            `}</style>
        </div>
    );
}
