import React from 'react';
import { Trash2, Plus, Minus } from 'lucide-react';

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

const CustomNumberInput = ({ value, onChange, label, step = 1, min = null, max = null, className = "" }) => {
    const handleAdjust = (delta) => {
        let val = (parseFloat(value) || 0) + delta;
        if (min !== null) val = Math.max(min, val);
        if (max !== null) val = Math.min(max, val);
        // Fix floating point issues for steps like 0.01 or 0.125
        const decimalPlaces = step.toString().split('.')[1]?.length || 0;
        val = parseFloat(val.toFixed(decimalPlaces));
        onChange(val);
    };

    return (
        <div className={`custom-number-input-container ${className}`}>
            {label && <label className="compact-label">{label}</label>}
            <div className="custom-number-input-group">
                <button className="adjust-btn minus" onClick={() => handleAdjust(-step)}>
                    <Minus size={14} strokeWidth={3} />
                </button>
                <input
                    type="number"
                    value={value}
                    step={step}
                    onChange={(e) => {
                        let val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                            if (min !== null) val = Math.max(min, val);
                            if (max !== null) val = Math.min(max, val);
                            onChange(val);
                        }
                    }}
                />
                <button className="adjust-btn plus" onClick={() => handleAdjust(step)}>
                    <Plus size={14} strokeWidth={3} />
                </button>
            </div>
        </div>
    );
};

export default function ClipEditor({ clips = [], onChange, onDelete, assets = {}, lightGroups = {}, carGroups = [], allCarsThumbnail = null }) {
    if (clips.length === 0) return <div className="p-4 text-gray-500">No clips selected</div>;

    const isMulti = clips.length > 1;
    const firstClip = clips[0];
    const allSameType = clips.every(c => c.type === firstClip.type);

    // Derived clip that represents the shared state
    const mergedClip = React.useMemo(() => {
        if (!isMulti) return firstClip;

        const merged = { ...firstClip };
        const fields = Object.keys(firstClip);

        fields.forEach(field => {
            const values = clips.map(c => c[field]);
            const allSame = values.every(v => JSON.stringify(v) === JSON.stringify(values[0]));
            if (!allSame) {
                merged[field] = '__mixed__';
            }
        });
        return merged;
    }, [clips]);

    if (!allSameType) {
        return (
            <div className="clip-editor">
                <div className="header">
                    <h3>Multiple Clips</h3>
                    <button onClick={() => onDelete(clips.map(c => c.id))} className="delete-btn">
                        <Trash2 size={18} />
                    </button>
                </div>
                <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-md text-yellow-200 text-sm">
                    Multiple types selected. Please select clips of the same type to edit shared properties.
                </div>
            </div>
        );
    }

    const handleChange = (field, value) => {
        if (isMulti) {
            // Send partial update with field hint
            onChange({ [field]: value }, field);
        } else {
            onChange({ ...firstClip, [field]: value });
        }
    };

    const handleChanges = (updates) => {
        if (isMulti) {
            onChange(updates, '__multiple__');
        } else {
            onChange({ ...firstClip, ...updates });
        }
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
        const current = new Set(Array.isArray(mergedClip.targetLightGroups) ? mergedClip.targetLightGroups : []);
        const exists = current.has(groupName);

        if (exists) {
            current.delete(groupName);
        } else {
            current.add(groupName);
        }

        handleChange('targetLightGroups', Array.from(current));
    };

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

    const clip = mergedClip;

    return (
        <div className="clip-editor">
            <div className="header">
                <h3>{isMulti ? `Edit ${clips.length} Clips` : 'Edit Clip'}</h3>
                <button onClick={() => onDelete(isMulti ? clips.map(c => c.id) : clip.id)} className="delete-btn">
                    <Trash2 size={18} />
                </button>
            </div>

            <div className="section-container">
                <label className="section-title">Timing</label>
                <div className="form-group grid-2">
                    <div className="timing-unit-wrapper">
                        <CustomNumberInput
                            label="Start Time"
                            value={clip.startTime === '__mixed__' ? '' : Number((clip.startTime || 0).toFixed(2))}
                            step={10}
                            min={0}
                            onChange={val => handleChange('startTime', parseFloat(val.toFixed(2)) || 0)}
                            className="timing-input"
                        />
                        <span className="unit-hint-sub">{clip.startTime === '__mixed__' ? 'Mixed' : (clip.startTime / 1000).toFixed(2) + 's'}</span>
                    </div>
                    <div className="timing-unit-wrapper">
                        <CustomNumberInput
                            label="Duration"
                            value={clip.duration === '__mixed__' ? '' : Number((clip.duration || 0).toFixed(2))}
                            step={10}
                            min={0}
                            onChange={val => handleChange('duration', parseFloat(val.toFixed(2)) || 0)}
                            className="timing-input"
                        />
                        <span className="unit-hint-sub">{clip.duration === '__mixed__' ? 'Mixed' : (clip.duration / 1000).toFixed(2) + 's'}</span>
                    </div>
                </div>

                {clip.type === 'gif' && (
                    <div className="form-group grid-3" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #222' }}>
                        <CustomNumberInput
                            label="BPM"
                            value={clip.bpm === '__mixed__' ? '' : (clip.bpm || 120)}
                            step={1}
                            min={1}
                            onChange={bpm => {
                                const updatedClip = { ...clip, bpm, timingMode: 'beat' };
                                const duration = calculateDuration('beat', updatedClip);
                                handleChange('bpm', bpm);
                                handleChange('duration', duration);
                            }}
                        />
                        <CustomNumberInput
                            label="Beats/Frm"
                            value={clip.beatsPerFrame === '__mixed__' ? '' : (clip.beatsPerFrame || 1)}
                            step={0.125}
                            min={0.125}
                            onChange={beatsPerFrame => {
                                const updatedClip = { ...clip, beatsPerFrame, timingMode: 'beat' };
                                const duration = calculateDuration('beat', updatedClip);
                                handleChange('beatsPerFrame', beatsPerFrame);
                                handleChange('duration', duration);
                            }}
                        />
                        <CustomNumberInput
                            label="Repeat"
                            value={clip.repetitions === '__mixed__' ? '' : (clip.repetitions || 1)}
                            step={1}
                            min={1}
                            onChange={repetitions => {
                                const updatedClip = { ...clip, repetitions, timingMode: 'beat' };
                                const duration = calculateDuration('beat', updatedClip);
                                handleChange('repetitions', repetitions);
                                handleChange('duration', duration);
                            }}
                        />
                    </div>
                )}
            </div>

            {clip.type === 'gif' && (
                <div className="section-container">
                    <label className="section-title">Placement</label>
                    <div className="form-group grid-3">
                        <CustomNumberInput
                            label="Offset X"
                            value={clip.offsetX === '__mixed__' ? '' : (clip.offsetX || 0)}
                            step={1}
                            onChange={val => handleChange('offsetX', val)}
                        />
                        <CustomNumberInput
                            label="Offset Y"
                            value={clip.offsetY === '__mixed__' ? '' : (clip.offsetY || 0)}
                            step={1}
                            onChange={val => handleChange('offsetY', val)}
                        />
                    </div>
                </div>
            )}

            {clip.type === 'effect' && (
                <>
                    <div className="section-container">
                        <label className="section-title">Effect Style</label>
                        <div className="form-group">
                            <label className="compact-label" style={{ minWidth: '80px' }}>Style</label>
                            <select
                                value={clip.effectType === '__mixed__' ? '' : (clip.effectType || 'flash')}
                                onChange={e => handleChange('effectType', e.target.value)}
                            >
                                {clip.effectType === '__mixed__' && <option value="">(Mixed)</option>}
                                <option value="flash">Flash (Hold)</option>
                                <option value="strobe">Strobe</option>
                            </select>
                        </div>

                        {clip.effectType !== '__mixed__' && clip.effectType === 'strobe' && (
                            <div className="form-group">
                                <label className="compact-label" style={{ minWidth: '80px' }}>Speed</label>
                                <div className="slider-with-val" style={{ flex: 1 }}>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="10"
                                        step="0.5"
                                        value={clip.speed === '__mixed__' ? 1 : (clip.speed || 1)}
                                        onChange={e => handleChange('speed', parseFloat(e.target.value))}
                                    />
                                    <span className="val-hint">{clip.speed === '__mixed__' ? 'Mixed' : (clip.speed || 1).toFixed(1) + 'Hz'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="section-container">
                        <label className="section-title">Pattern</label>
                        <div className="form-group">
                            <label className="compact-label" style={{ minWidth: '55px' }}>Type</label>
                            <select
                                value={clip.pattern === '__mixed__' ? '' : (clip.pattern || 'uniform')}
                                onChange={e => {
                                    const newPattern = e.target.value;
                                    // Reset direction to valid default for the new pattern type
                                    const dirDefaults = {
                                        'wave': 'horizontal', 'sequential': 'row-by-row', 'radial': 'outward',
                                        'directional': 'to-right', 'new-radial': 'close', 'curtain': 'vert-close',
                                    };
                                    const newDir = dirDefaults[newPattern];
                                    const updates = { pattern: newPattern };
                                    if (newDir) updates.patternDirection = newDir;

                                    // Set defaults for new patterns to avoid undefined/NaN in renderer
                                    if (newPattern === 'noise') {
                                        updates.patternDensity = 0.5;
                                        updates.patternInterval = 100;
                                    }

                                    handleChanges(updates);
                                }}
                                style={{ flex: 1 }}
                            >
                                {clip.pattern === '__mixed__' && <option value="">(Mixed)</option>}
                                <option value="uniform">Fill</option>
                                <option value="wave">Wave (deprecated)</option>
                                <option value="sequential">Sequential (deprecated)</option>
                                <option value="radial">Radial (deprecated)</option>
                                <option disabled>──────────</option>
                                <option value="directional">Directional</option>
                                <option value="new-radial">New Radial</option>
                                <option value="curtain">Curtain</option>
                                <option value="dissolve">Dissolve</option>
                                <option value="noise">Noise</option>
                            </select>
                            {clip.pattern !== '__mixed__' && (
                                <div className="invert-toggle-mini">
                                    <input
                                        type="checkbox"
                                        id="pattern-invert"
                                        checked={clip.patternInvert === '__mixed__' ? false : (clip.patternInvert || false)}
                                        ref={el => el && (el.indeterminate = clip.patternInvert === '__mixed__')}
                                        onChange={e => handleChange('patternInvert', e.target.checked)}
                                    />
                                    <label htmlFor="pattern-invert" className="compact-label" style={{ margin: 0, cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>INVERT</label>
                                </div>
                            )}
                        </div>

                        {clip.pattern === 'noise' && (
                            <div className="section-container content-box" style={{ marginTop: '4px', padding: '8px' }}>
                                <div className="form-group" style={{ marginBottom: '6px' }}>
                                    <label className="compact-label" style={{ minWidth: '80px' }}>Density</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="5"
                                        value={clip.patternDensity === '__mixed__' ? 50 : (clip.patternDensity * 100 || 50)}
                                        onChange={e => handleChange('patternDensity', parseInt(e.target.value) / 100)}
                                        style={{ flex: 1 }}
                                    />
                                    <span style={{ fontSize: '11px', minWidth: '35px', textAlign: 'right' }}>
                                        {clip.patternDensity === '__mixed__' ? '??%' : Math.round((clip.patternDensity || 0.5) * 100) + '%'}
                                    </span>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="compact-label" style={{ minWidth: '80px' }}>Interval</label>
                                    <input
                                        type="range"
                                        min="20"
                                        max="200"
                                        step="20"
                                        value={clip.patternInterval === '__mixed__' ? 100 : (clip.patternInterval || 100)}
                                        onChange={e => handleChange('patternInterval', parseInt(e.target.value))}
                                        style={{ flex: 1 }}
                                    />
                                    <span style={{ fontSize: '11px', minWidth: '35px', textAlign: 'right' }}>
                                        {clip.patternInterval === '__mixed__' ? '??ms' : (clip.patternInterval || 100) + 'ms'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {clip.pattern !== '__mixed__' && clip.pattern !== 'uniform' && (
                            <>
                                {/* Direction: show for all except dissolve and noise */}
                                {clip.pattern !== 'dissolve' && clip.pattern !== 'noise' && (
                                    <div className="form-group">
                                        <label className="compact-label" style={{ minWidth: '80px' }}>Dir</label>
                                        <select
                                            value={clip.patternDirection === '__mixed__' ? '' : (clip.patternDirection || 'horizontal')}
                                            onChange={e => handleChange('patternDirection', e.target.value)}
                                        >
                                            {clip.patternDirection === '__mixed__' && <option value="">(Mixed)</option>}
                                            {clip.pattern === 'wave' && (
                                                <>
                                                    <option value="horizontal">Horizontal (Right)</option>
                                                    <option value="vertical">Vertical (Down)</option>
                                                    <option value="diagonal-right">↘ (Down-Right)</option>
                                                    <option value="diagonal-left">↙ (Down-Left)</option>
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
                                            {clip.pattern === 'directional' && (
                                                <>
                                                    <option value="to-right">To Right</option>
                                                    <option value="to-left">To Left</option>
                                                    <option value="to-down">To Down</option>
                                                    <option value="to-up">To Up</option>
                                                    <option value="to-down-right">To Down-Right</option>
                                                    <option value="to-down-left">To Down-Left</option>
                                                    <option value="to-up-right">To Up-Right</option>
                                                    <option value="to-up-left">To Up-Left</option>
                                                </>
                                            )}
                                            {clip.pattern === 'new-radial' && (
                                                <>
                                                    <option value="close">Close</option>
                                                    <option value="open">Open</option>
                                                </>
                                            )}
                                            {clip.pattern === 'curtain' && (
                                                <>
                                                    <option value="vert-close">Vertical Close</option>
                                                    <option value="vert-open">Vertical Open</option>
                                                    <option value="horiz-close">Horizontal Close</option>
                                                    <option value="horiz-open">Horizontal Open</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                )}

                                {/* Speed: only for legacy patterns */}
                                {['wave', 'sequential', 'radial'].includes(clip.pattern) && (
                                    <div className="form-group">
                                        <label className="compact-label" style={{ minWidth: '80px' }}>Speed</label>
                                        <div className="slider-with-val" style={{ flex: 1 }}>
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="5"
                                                step="0.1"
                                                value={clip.patternSpeed === '__mixed__' ? 1 : (clip.patternSpeed || 1)}
                                                onChange={e => handleChange('patternSpeed', parseFloat(e.target.value))}
                                            />
                                            <span className="val-hint">{clip.patternSpeed === '__mixed__' ? 'Mixed' : (clip.patternSpeed || 1).toFixed(1) + 'x'}</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                </>
            )
            }

            {
                clip.type !== 'gif' && (
                    <div className="section-container content-box">
                        <label className="section-title">Target Light Groups</label>
                        <div className="channels-list">
                            {Object.entries(displayGroups).map(([label, groupData]) => {
                                const values = clips.map(c => (c.targetLightGroups || []).includes(label));
                                const allSame = values.every(v => v === values[0]);
                                const isChecked = allSame ? values[0] : false;

                                return (
                                    <label key={label} className="channel-item" style={{ opacity: allSame ? 1 : 0.6 }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            ref={el => el && (el.indeterminate = !allSame)}
                                            onChange={() => toggleLightGroup(label)}
                                        />
                                        <span>{label} {!allSame && '(Mixed)'}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )
            }

            {
                clip.type !== 'gif' && (
                    <div className="section-container content-box">
                        <div className="ramping-header-row">
                            <div className="toggle-group-inline">
                                <input
                                    id="ramping-toggle"
                                    type="checkbox"
                                    className="toggle-checkbox"
                                    checked={clip.rampingEnabled === '__mixed__' ? false : (clip.rampingEnabled || false)}
                                    ref={el => el && (el.indeterminate = clip.rampingEnabled === '__mixed__')}
                                    onChange={e => {
                                        const enabled = e.target.checked;
                                        const updates = { rampingEnabled: enabled };
                                        if (enabled) {
                                            updates.rampOnDuration = clip.rampOnDuration === '__mixed__' ? 500 : (clip.rampOnDuration || 500);
                                            updates.rampOffDuration = clip.rampOffDuration === '__mixed__' ? 500 : (clip.rampOffDuration || 500);
                                        }
                                        handleChanges(updates);
                                    }}
                                />
                                <label htmlFor="ramping-toggle" className="section-title-inline">Ramping {clip.rampingEnabled === '__mixed__' && '(Mixed)'}</label>
                            </div>
                        </div>

                        {clip.rampingEnabled !== false && (
                            <div className="ramping-controls-horizontal">
                                <div className="ramping-row">
                                    <label className="ramp-label-inline">ON</label>
                                    <select
                                        className="ramp-select"
                                        value={clip.rampOnDuration === '__mixed__' ? '' : (clip.rampOnDuration || 0)}
                                        onChange={e => handleChange('rampOnDuration', parseInt(e.target.value))}
                                    >
                                        {clip.rampOnDuration === '__mixed__' && <option value="">(Mixed)</option>}
                                        <option value="0">Instant (0ms)</option>
                                        <option value="500">500 ms</option>
                                        <option value="1000">1000 ms</option>
                                        <option value="2000">2000 ms</option>
                                    </select>
                                </div>

                                <div className="ramping-row">
                                    <label className="ramp-label-inline">OFF</label>
                                    <select
                                        className="ramp-select"
                                        value={clip.rampOffDuration === '__mixed__' ? '' : (clip.rampOffDuration || 0)}
                                        onChange={e => handleChange('rampOffDuration', parseInt(e.target.value))}
                                    >
                                        {clip.rampOffDuration === '__mixed__' && <option value="">(Mixed)</option>}
                                        <option value="0">Instant (0ms)</option>
                                        <option value="500">500 ms</option>
                                        <option value="1000">1000 ms</option>
                                        <option value="2000">2000 ms</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {
                !isMulti && clip.type === 'gif' && (
                    <div className="section-container content-box">
                        <label className="section-title">Preview</label>
                        {clip.assetId && assets[clip.assetId] ? (
                            <GifPreview asset={assets[clip.assetId]} fps={clip.fps || 15} />
                        ) : (
                            <div className="text-gray-500 text-sm p-2">No asset loaded</div>
                        )}
                    </div>
                )
            }

            <div className="section-container content-box car-selection-box">
                <label className="section-title">Target Car Group</label>
                <div className="group-grid">
                    <button
                        className={`group-grid-item ${clip.carGroupId === '' ? 'active' : ''}`}
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
                            <span>{group.name} {clip.carGroupId === '__mixed__' && '(Mixed)'}</span>
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

                .invert-toggle-mini {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    background: #222;
                    padding: 2px 3px;
                    border-radius: 4px;
                    border: 1px solid #333;
                    margin-left: 2px;
                    height: 24px;
                    flex-shrink: 0;
                }

                .invert-toggle-mini input {
                    margin: 0;
                    cursor: pointer;
                    width: 14px;
                    height: 14px;
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
                    gap: 4px;
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
                    padding: 6px 8px;
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

                .form-group input[type="number"].small-input,
                .form-group input[type="text"].small-input {
                    padding: 4px 8px;
                    font-size: 12px;
                    max-width: 60px;
                }

                .custom-number-input-container {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                }

                .custom-number-input-group {
                    display: flex;
                    align-items: stretch;
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 6px;
                    overflow: hidden;
                    height: 28px;
                }

                .custom-number-input-group input {
                    flex: 1;
                    min-width: 0;
                    width: 100% !important;
                    background: transparent !important;
                    border: none !important;
                    text-align: center;
                    padding: 0 4px !important;
                    font-size: 12px !important;
                    -moz-appearance: textfield;
                }

                .custom-number-input-group input::-webkit-outer-spin-button,
                .custom-number-input-group input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }

                .adjust-btn {
                    background: #333;
                    border: none;
                    color: #aaa;
                    width: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .adjust-btn:hover {
                    background: #444;
                    color: white;
                }

                .adjust-btn.plus:active { background: #059669; }
                .adjust-btn.minus:active { background: #dc2626; }

                .timing-input {
                    max-width: 110px;
                }

                .timing-unit-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                }

                .unit-hint-sub {
                    font-size: 10px;
                    color: #888;
                    font-family: monospace;
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
                    display: grid !important;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }

                .grid-3 {
                    display: grid !important;
                    grid-template-columns: repeat(3, 1fr);
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

                .ramp-select {
                    flex: 1;
                    background: #2a2a2a;
                    border: 1px solid #444;
                    border-radius: 4px;
                    padding: 4px 8px;
                    color: white;
                    font-size: 12px;
                    outline: none;
                }

                .ramp-select:focus {
                    border-color: #e82020;
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
        </div >
    );
}
