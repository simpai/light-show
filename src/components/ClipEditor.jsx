import React, { useRef } from 'react';
import { Trash2, Plus, Minus, Download, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { EASING_TYPES } from '../utils/Easing.js';
import { getSpectrogramColor } from '../utils/colorUtils.js';

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
    const [localValue, setLocalValue] = React.useState(String(value ?? ''));
    const inputRef = React.useRef(null);

    React.useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setLocalValue(String(value ?? ''));
        } else {
            const parsed = parseFloat(localValue);
            if (!isNaN(parsed) && parsed !== value && String(value) !== '__mixed__') {
                // Prop changed externally while focused (e.g., undo/redo or sync)
                if (Math.abs(parsed - value) > 0.000001) {
                    setLocalValue(String(value ?? ''));
                }
            }
        }
    }, [value]);

    const handleInput = (e) => {
        const raw = e.target.value;
        setLocalValue(raw);

        // Avoid committing incomplete numbers
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;

        const val = parseFloat(raw);
        if (!isNaN(val)) {
            let clamped = val;
            if (min !== null) clamped = Math.max(min, clamped);
            if (max !== null) clamped = Math.min(max, clamped);

            // Only trigger onChange if it actually changed
            if (clamped !== value) {
                onChange(clamped);
            }
        }
    };

    const commit = () => {
        const val = parseFloat(localValue);
        if (!isNaN(val)) {
            let clamped = val;
            if (min !== null) clamped = Math.max(min, clamped);
            if (max !== null) clamped = Math.min(max, clamped);
            if (clamped !== value) {
                onChange(clamped);
            }
            setLocalValue(String(clamped));
        } else {
            setLocalValue(String(value ?? ''));
        }
    };

    return (
        <div className={`custom-number-input-container ${className}`}>
            {label && <label className="compact-label">{label}</label>}
            <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                className="plain-number-input"
                value={localValue}
                onChange={handleInput}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                style={{
                    width: '100%', fontSize: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '3px', color: '#e2e8f0', height: '24px'
                }}
            />
        </div>
    );
};

const BinRangeSelector = ({ minBin = 0, maxBin = 31, onChange }) => {
    const isDragging = useRef(false);
    const startIndex = useRef(null);

    const handleInput = (index) => {
        if (!isDragging.current) return;
        const newMin = Math.min(startIndex.current, index);
        const newMax = Math.max(startIndex.current, index);
        onChange(newMin, newMax);
    };

    const handlePointerDown = (index, e) => {
        e.preventDefault();
        isDragging.current = true;
        startIndex.current = index;
        onChange(index, index);
        document.addEventListener('pointerup', handlePointerUp);
    };

    const handlePointerUp = () => {
        isDragging.current = false;
        document.removeEventListener('pointerup', handlePointerUp);
    };

    const bins = Array.from({ length: 32 }, (_, i) => i);

    return (
        <div style={{ marginTop: '8px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#888' }}>Bin Selector</span>
                <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold' }}>
                    [{minBin} - {maxBin}]
                </span>
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: '1px',
                    height: '32px',
                    width: '100%',
                    background: '#1a1a1a',
                    padding: '4px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    touchAction: 'none'
                }}
                onPointerLeave={() => isDragging.current = false}
            >
                {bins.map(i => {
                    const isActive = i >= minBin && i <= maxBin;
                    const isEdge = i === minBin || i === maxBin;
                    // Make it look like a logarithmic curve roughly
                    const heightPct = 20 + Math.pow(i / 31, 0.5) * 80;

                    return (
                        <div
                            key={i}
                            onPointerDown={(e) => handlePointerDown(i, e)}
                            onPointerEnter={() => handleInput(i)}
                            style={{
                                flex: 1,
                                height: '100%',
                                display: 'flex',
                                alignItems: 'flex-end',
                                cursor: 'crosshair',
                                padding: '0 0.5px' // Tiny gap between bars visually but full width hitbox
                            }}
                            title={`Bin ${i}`}
                        >
                            <div
                                style={{
                                    width: '100%',
                                    height: `${heightPct}%`,
                                    background: getSpectrogramColor(i, isActive, isEdge),
                                    borderRadius: '1px',
                                    transition: 'background-color 0.1s',
                                    opacity: isActive ? 1 : 0.5
                                }}
                            />
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#666' }}>
                <span>Low (20Hz)</span>
                <span>Mid</span>
                <span>High (12kHz)</span>
            </div>
        </div>
    );
};

export default function ClipEditor({ clips = [], onChange, onDelete, allCarsThumbnail = null }) {
    const project = useStore(state => state.project);
    const assets = project?.assets || {};
    const lightGroups = project?.lightGroups || {};
    const carGroups = project?.carGroups || [];
    const isMulti = clips.length > 1;
    const firstClip = clips[0];
    const allSameType = clips.length > 0 ? clips.every(c => c.type === firstClip.type) : true;

    // Derived clip that represents the shared state
    const mergedClip = React.useMemo(() => {
        if (!isMulti || clips.length === 0) return firstClip || {};

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
    }, [clips, isMulti, firstClip]);

    const importInputRef = React.useRef(null);

    if (clips.length === 0) return <div className="p-4 text-gray-500">No clips selected</div>;

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

    const handleExportClip = () => {
        const exportData = { ...firstClip };
        delete exportData.id;
        delete exportData.startTime;

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const dnNode = document.createElement('a');
        dnNode.setAttribute("href", dataStr);
        dnNode.setAttribute("download", `clip_settings_${firstClip.type}.json`);
        document.body.appendChild(dnNode);
        dnNode.click();
        dnNode.remove();
    };

    const handleImportClip = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedSettings = JSON.parse(event.target.result);
                delete importedSettings.id;
                delete importedSettings.startTime;
                handleChanges(importedSettings);
            } catch (err) {
                console.error("Failed to parse clip settings", err);
                alert("Invalid clip settings file.");
            }
            e.target.value = null;
        };
        reader.readAsText(file);
    };

    return (
        <div className="clip-editor">
            <div className="header">
                <h3>{isMulti ? `Edit ${clips.length} Clips` : 'Edit Clip'}</h3>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button onClick={handleExportClip} className="action-btn" title="Export Clip Settings">
                        <Download size={16} />
                    </button>
                    <label className="action-btn" title="Import Clip Settings" style={{ cursor: 'pointer', margin: 0 }}>
                        <Upload size={16} />
                        <input type="file" ref={importInputRef} accept=".json" style={{ display: 'none' }} onChange={handleImportClip} />
                    </label>
                    <button onClick={() => onDelete(isMulti ? clips.map(c => c.id) : clip.id)} className="delete-btn" title="Delete Clip">
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            <div className="section-container">
                <label className="section-title">Timing</label>
                <div className="form-group grid-2">
                    <div className="timing-unit-wrapper">
                        <CustomNumberInput
                            label="Start"
                            value={clip.startTime === '__mixed__' ? '' : Number((clip.startTime || 0).toFixed(2))}
                            step={10}
                            min={0}
                            onChange={val => {
                                const newStartTime = parseFloat(val.toFixed(2)) || 0;
                                if (clip.type === 'midi-region' && !isMulti) {
                                    const diff = newStartTime - (clip.startTime || 0);
                                    handleChanges({
                                        startTime: newStartTime,
                                        startOffset: (clip.startOffset || 0) + diff
                                    });
                                } else {
                                    handleChange('startTime', newStartTime);
                                }
                            }}
                            className="timing-input"
                        />
                        {/* <span className="unit-hint-sub">{clip.startTime === '__mixed__' ? 'Mixed' : (clip.startTime / 1000).toFixed(2) + 's'}</span> */}
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
                        {/* <span className="unit-hint-sub">{clip.duration === '__mixed__' ? 'Mixed' : (clip.duration / 1000).toFixed(2) + 's'}</span> */}
                    </div>
                </div>

                {clip.type === 'gif' && (
                    <div className="form-group grid-3" style={{ borderTop: '1px solid #222' }}>
                        <CustomNumberInput
                            label="BPM"
                            value={clip.bpm === '__mixed__' ? '' : (clip.bpm || 120)}
                            step={1}
                            min={1}
                            onChange={bpm => {
                                const updatedClip = { ...clip, bpm, timingMode: 'beat' };
                                const duration = calculateDuration('beat', updatedClip);
                                handleChanges({ bpm, duration });
                            }}
                        />
                        <CustomNumberInput
                            label="Beat/Frm"
                            value={clip.beatsPerFrame === '__mixed__' ? '' : (clip.beatsPerFrame || 1)}
                            onChange={beatsPerFrame => {
                                const updatedClip = { ...clip, beatsPerFrame, timingMode: 'beat' };
                                const duration = calculateDuration('beat', updatedClip);
                                handleChanges({ beatsPerFrame, duration });
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
                                handleChanges({ repetitions, duration });
                            }}
                        />
                    </div>
                )}
            </div>

            {clip.type === 'gif' && (
                <div className="section-container">
                    <label className="section-title">Offset Animation</label>
                    <div className="form-group grid-2">
                        <CustomNumberInput
                            label="Start X"
                            value={clip.startOffsetX === '__mixed__' ? '' : (clip.startOffsetX ?? clip.offsetX ?? 0)}
                            step={1}
                            onChange={val => handleChange('startOffsetX', val)}
                        />
                        <CustomNumberInput
                            label="Start Y"
                            value={clip.startOffsetY === '__mixed__' ? '' : (clip.startOffsetY ?? clip.offsetY ?? 0)}
                            step={1}
                            onChange={val => handleChange('startOffsetY', val)}
                        />
                    </div>
                    <div className="form-group grid-2" style={{ marginTop: '4px' }}>
                        <CustomNumberInput
                            label="End X"
                            value={clip.endOffsetX === '__mixed__' ? '' : (clip.endOffsetX ?? clip.startOffsetX ?? clip.offsetX ?? 0)}
                            step={1}
                            onChange={val => handleChange('endOffsetX', val)}
                        />
                        <CustomNumberInput
                            label="End Y"
                            value={clip.endOffsetY === '__mixed__' ? '' : (clip.endOffsetY ?? clip.startOffsetY ?? clip.offsetY ?? 0)}
                            step={1}
                            onChange={val => handleChange('endOffsetY', val)}
                        />
                    </div>
                    <div className="form-group" style={{ marginTop: '4px' }}>
                        <label className="compact-label" style={{ minWidth: '60px' }}>Easing</label>
                        <select
                            value={clip.offsetEasing || 'linear'}
                            onChange={e => handleChange('offsetEasing', e.target.value)}
                            className="select-input"
                        >
                            {EASING_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                    {(() => {
                        const totalFrames = Math.floor((clip.duration || 0) / 20);
                        if (totalFrames <= 0) return null;
                        const startX = clip.startOffsetX ?? clip.offsetX ?? 0;
                        const startY = clip.startOffsetY ?? clip.offsetY ?? 0;
                        const endX = clip.endOffsetX ?? startX;
                        const endY = clip.endOffsetY ?? startY;

                        // Find nearest end value that gives integer px/frame
                        const findBestEnd = (start, end) => {
                            const delta = end - start;
                            if (delta === 0) return start;
                            const sign = delta > 0 ? 1 : -1;
                            const absDelta = Math.abs(delta);
                            // Collect all divisors of totalFrames + multiples near absDelta
                            const candidates = [];
                            for (let d = 1; d * d <= totalFrames; d++) {
                                if (totalFrames % d === 0) {
                                    candidates.push(d);
                                    candidates.push(totalFrames / d);
                                }
                            }
                            // Also add multiples of totalFrames near the target
                            const nearMult = Math.round(absDelta / totalFrames);
                            for (let m = Math.max(1, nearMult - 2); m <= nearMult + 2; m++) {
                                candidates.push(m * totalFrames);
                            }
                            // Find closest candidate to absDelta
                            let best = candidates[0];
                            for (const c of candidates) {
                                if (Math.abs(c - absDelta) < Math.abs(best - absDelta)) best = c;
                            }
                            return start + best * sign;
                        };

                        const recEndX = findBestEnd(startX, endX);
                        const recEndY = findBestEnd(startY, endY);
                        const recStepX = totalFrames > 0 ? (recEndX - startX) / totalFrames : 0;
                        const recStepY = totalFrames > 0 ? (recEndY - startY) / totalFrames : 0;
                        const curStepX = totalFrames > 0 ? (endX - startX) / totalFrames : 0;
                        const curStepY = totalFrames > 0 ? (endY - startY) / totalFrames : 0;

                        return (
                            <div style={{ fontSize: '9px', color: '#f87171', marginTop: '4px', lineHeight: '1.5' }}>
                                {totalFrames}f | X:{curStepX.toFixed(2)}px/f Y:{curStepY.toFixed(2)}px/f
                                <br />
                                → End X:{recEndX} ({recStepX}px/f) Y:{recEndY} ({recStepY}px/f)
                            </div>
                        );
                    })()}
                </div>
            )}

            {clip.type === 'gif' && (
                <div className="section-container">
                    <label className="section-title">Options</label>
                    <div className="form-group grid-2">
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#a5b4fc' }}>
                            <input
                                type="checkbox"
                                checked={clip.invertImage === '__mixed__' ? false : (clip.invertImage || false)}
                                ref={el => el && (el.indeterminate = clip.invertImage === '__mixed__')}
                                onChange={e => handleChange('invertImage', e.target.checked)}
                            />
                            Invert Image
                        </label>
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#fcd34d' }}>
                            <input
                                type="checkbox"
                                checked={clip.disableTiling === '__mixed__' ? false : (clip.disableTiling || false)}
                                ref={el => el && (el.indeterminate = clip.disableTiling === '__mixed__')}
                                onChange={e => handleChange('disableTiling', e.target.checked)}
                            />
                            Disable Tiling
                        </label>
                    </div>
                    <div className="form-group grid-2" style={{ marginTop: '4px' }}>
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#86efac' }}>
                            <input
                                type="checkbox"
                                checked={clip.flipHorizontal === '__mixed__' ? false : (clip.flipHorizontal || false)}
                                ref={el => el && (el.indeterminate = clip.flipHorizontal === '__mixed__')}
                                onChange={e => handleChange('flipHorizontal', e.target.checked)}
                            />
                            Flip H
                        </label>
                        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#86efac' }}>
                            <input
                                type="checkbox"
                                checked={clip.flipVertical === '__mixed__' ? false : (clip.flipVertical || false)}
                                ref={el => el && (el.indeterminate = clip.flipVertical === '__mixed__')}
                                onChange={e => handleChange('flipVertical', e.target.checked)}
                            />
                            Flip V
                        </label>
                    </div>

                    <label className="section-title" style={{ marginTop: '12px' }}>Transition</label>
                    <div className="form-group">
                        <label className="compact-label" style={{ minWidth: '80px' }}>Type</label>
                        <select
                            value={clip.transitionType === '__mixed__' ? '' : (clip.transitionType || 'none')}
                            onChange={e => handleChange('transitionType', e.target.value)}
                        >
                            {clip.transitionType === '__mixed__' && <option value="">(Mixed)</option>}
                            <option value="none">None</option>
                            <option value="dissolve">Dissolve</option>
                            <option value="wipe-right">Wipe Right</option>
                            <option value="wipe-left">Wipe Left</option>
                            <option value="wipe-down">Wipe Down</option>
                            <option value="wipe-up">Wipe Up</option>
                            <option value="push-right">Push Right</option>
                            <option value="push-left">Push Left</option>
                        </select>
                    </div>

                    {(clip.transitionType && clip.transitionType !== 'none' && clip.transitionType !== '__mixed__') && (
                        <div className="form-group">
                            <label className="compact-label" style={{ minWidth: '80px' }}>Overlap</label>
                            <div className="slider-with-val" style={{ flex: 1 }}>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="0.95"
                                    step="0.05"
                                    value={clip.transitionOverlap === '__mixed__' ? 0.5 : (clip.transitionOverlap || 0.5)}
                                    onChange={e => handleChange('transitionOverlap', parseFloat(e.target.value))}
                                />
                                <span className="val-hint">{clip.transitionOverlap === '__mixed__' ? 'Mixed' : Math.round((clip.transitionOverlap || 0.5) * 100) + '%'}</span>
                            </div>
                        </div>
                    )}
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
                                        'diamond': 'close-straight', 'zig-zag': 'horizontal',
                                        'box-spiral': 'close-straight', 'interlace': 'horizontal',
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
                                <option value="diamond">Diamond</option>
                                <option value="zig-zag">Zig-Zag</option>
                                <option value="box-spiral">Box Spiral</option>
                                <option value="interlace">Interlace</option>
                                <option value="raindrops">Raindrops</option>
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
                                            {['wave', 'directional'].includes(clip.pattern) && (
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
                                            {['new-radial', 'diamond', 'box-spiral'].includes(clip.pattern) && (
                                                <>
                                                    <option value="close-straight">Close (Straight)</option>
                                                    <option value="open-straight">Open (Straight)</option>
                                                    {['diamond', 'box-spiral'].includes(clip.pattern) && (
                                                        <>
                                                            <option value="close-tilted">Close (Tilted)</option>
                                                            <option value="open-tilted">Open (Tilted)</option>
                                                        </>
                                                    )}
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
                                            {['zig-zag', 'interlace'].includes(clip.pattern) && (
                                                <>
                                                    <option value="horizontal">Horizontal</option>
                                                    <option value="vertical">Vertical</option>
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



            {clip.type === 'eq' && !isMulti && Array.isArray(clip.bands) && clip.bands.slice(0, 1).map((band, idx) => (
                <div key={idx} className="section-container content-box eq-band-card" style={{ padding: '8px', borderLeft: '3px solid #6366f1', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                        <strong style={{ fontSize: '13px', color: '#a5b4fc', margin: 0 }}>Band {idx + 1}</strong>
                        {band.imageId ? (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <label className="btn-icon" style={{ cursor: 'pointer', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px', padding: '2px', fontSize: '11px' }} title="Replace Image">
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            const event = new CustomEvent('imageUpload', {
                                                detail: { clipId: clip.id, file: e.target.files[0], bandIndex: idx }
                                            });
                                            window.dispatchEvent(event);
                                        }
                                    }} />
                                    Replace
                                </label>
                                <button className="btn-icon" onClick={() => {
                                    const newBands = [...clip.bands];
                                    newBands[idx] = { ...newBands[idx], imageId: null };
                                    handleChange('bands', newBands);
                                }} style={{ border: 'none', background: 'none', color: '#ef4444', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '11px' }} title="Remove Image">
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <label className="btn-icon" style={{ cursor: 'pointer', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px', fontSize: '11px' }}>
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        const event = new CustomEvent('imageUpload', {
                                            detail: { clipId: clip.id, file: e.target.files[0], bandIndex: idx }
                                        });
                                        window.dispatchEvent(event);
                                    }
                                }} />
                                Upload Mapping Image
                            </label>
                        )}
                    </div>
                    {band.imageId && assets[band.imageId] && (
                        <div style={{ marginBottom: '8px' }}>
                            <GifPreview asset={assets[band.imageId]} fps={1} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginTop: '4px', cursor: 'pointer', color: '#a5b4fc' }}>
                                <input type="checkbox" checked={band.invertImage || false} onChange={(e) => {
                                    const newBands = [...clip.bands];
                                    newBands[idx] = { ...newBands[idx], invertImage: e.target.checked };
                                    handleChange('bands', newBands);
                                }} />
                                Invert Image
                            </label>
                        </div>
                    )}
                    <BinRangeSelector
                        minBin={band.minBin !== undefined ? band.minBin : 0}
                        maxBin={band.maxBin !== undefined ? band.maxBin : 31}
                        onChange={(newMin, newMax) => {
                            const newBands = [...clip.bands];
                            newBands[idx].minBin = newMin;
                            newBands[idx].maxBin = newMax;
                            handleChange('bands', newBands);
                        }}
                    />
                    <div style={{ marginTop: '12px', padding: '10px', background: '#1a1a1a', borderRadius: '6px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '45px', fontSize: '11px', color: '#888', fontWeight: 'bold' }}>Scale</span>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="10"
                                    step="0.1"
                                    value={band.maxScale !== undefined ? band.maxScale : 1.0}
                                    style={{ flex: 1, accentColor: '#3b82f6' }}
                                    onChange={e => {
                                        const newBands = [...clip.bands];
                                        newBands[idx].maxScale = parseFloat(e.target.value);
                                        handleChange('bands', newBands);
                                    }}
                                />
                                <span style={{ width: '30px', fontSize: '11px', color: '#fff', textAlign: 'right' }}>{(band.maxScale !== undefined ? band.maxScale : 1.0).toFixed(1)}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '45px', fontSize: '11px', color: '#888', fontWeight: 'bold' }}>Cutoff</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={band.minCutoff !== undefined ? band.minCutoff : 0.0}
                                    style={{ flex: 1, accentColor: '#ef4444' }}
                                    onChange={e => {
                                        const newBands = [...clip.bands];
                                        newBands[idx].minCutoff = parseFloat(e.target.value);
                                        handleChange('bands', newBands);
                                    }}
                                />
                                <span style={{ width: '30px', fontSize: '11px', color: '#fff', textAlign: 'right' }}>{(band.minCutoff !== undefined ? band.minCutoff : 0).toFixed(2)}</span>
                            </div>
                        </div>

                        <div style={{
                            marginTop: '12px',
                            padding: '6px',
                            background: '#000',
                            borderRadius: '4px',
                            fontSize: '10px',
                            color: '#aaa',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '4px',
                            fontFamily: 'monospace'
                        }}>
                            <span>(</span>
                            <span style={{ color: '#10b981' }}>Vol</span>
                            <span style={{ margin: '0 4px', color: '#fff' }}>-</span>
                            <span style={{ color: '#ef4444' }}>{Number(band.minCutoff !== undefined ? band.minCutoff : 0).toFixed(2)}</span>
                            <span>)</span>
                            <span>×</span>
                            <span style={{ color: '#3b82f6' }}>{Number(band.maxScale !== undefined ? band.maxScale : 1.0).toFixed(1)}</span>
                            <span style={{ margin: '0 4px' }}>→</span>
                            <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>ON</span>
                        </div>
                    </div>
                </div>
            ))}

            {clip.type === 'eq' && (
                <div className="section-container content-box">
                    <label className="section-title">EQ Settings</label>
                    <div className="form-group">
                        <div className="toggle-group-inline" style={{ width: '100%', marginBottom: '8px' }}>
                            <input type="checkbox" id="peak-hold-toggle" className="toggle-checkbox"
                                checked={clip.peakHold === '__mixed__' ? false : (clip.peakHold || false)}
                                ref={el => el && (el.indeterminate = clip.peakHold === '__mixed__')}
                                onChange={e => handleChange('peakHold', e.target.checked)} />
                            <label htmlFor="peak-hold-toggle" className="section-title-inline">Peak Hold</label>
                        </div>
                    </div>
                    <div className="form-group grid-2">
                        <div>
                            <label className="compact-label" style={{ minWidth: '80px', display: 'block', marginBottom: '4px' }}>Decay Rate</label>
                            <CustomNumberInput
                                value={clip.decay === '__mixed__' ? '' : (clip.decay !== undefined ? clip.decay : 0.1)}
                                step={0.01} min={0} max={1.0}
                                onChange={val => handleChange('decay', val)}
                                className="timing-input"
                            />
                        </div>
                        <div>
                            <label className="compact-label" style={{ minWidth: '80px', display: 'block', marginBottom: '4px' }}>Update (ms)</label>
                            <select
                                value={clip.updateInterval === '__mixed__' ? '' : (clip.updateInterval || 20)}
                                onChange={e => handleChange('updateInterval', parseInt(e.target.value))}
                                className="select-input"
                                style={{ width: '100%' }}
                            >
                                {clip.updateInterval === '__mixed__' && <option value="">(Mixed)</option>}
                                <option value={20}>20ms (50fps)</option>
                                <option value={40}>40ms (25fps)</option>
                                <option value={80}>80ms (12.5fps)</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group" style={{ marginTop: '8px' }}>
                        <CustomNumberInput
                            label="Time Offset (ms)"
                            value={clip.eqTimeOffset === '__mixed__' ? '' : (clip.eqTimeOffset || 0)}
                            step={10}
                            onChange={val => handleChange('eqTimeOffset', val)}
                            className="timing-input"
                        />
                    </div>
                </div>
            )}

            {
                (
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
                !['gif', 'eq'].includes(clip.type) && (
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                                <GifPreview asset={assets[clip.assetId]} fps={clip.fps || 15} />
                                <label className="action-btn" style={{ cursor: 'pointer', margin: 0, padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            const event = new CustomEvent('imageUpload', {
                                                detail: { clipId: clip.id, file: e.target.files[0] }
                                            });
                                            window.dispatchEvent(event);
                                        }
                                        e.target.value = '';
                                    }} />
                                    <Upload size={14} />
                                    Change Image
                                </label>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                                <div className="text-gray-500 text-sm p-2">No asset loaded</div>
                                <label className="action-btn" style={{ cursor: 'pointer', margin: 0, padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            const event = new CustomEvent('imageUpload', {
                                                detail: { clipId: clip.id, file: e.target.files[0] }
                                            });
                                            window.dispatchEvent(event);
                                        }
                                        e.target.value = '';
                                    }} />
                                    <Upload size={14} />
                                    Upload Image
                                </label>
                            </div>
                        )}
                    </div>
                )
            }

            {clip.type !== 'eq' && (
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
            )}

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

                .action-btn {
                    background: none;
                    border: none;
                    color: #d1d5db;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 4px;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .action-btn:hover {
                    background: #2a2a2a;
                    color: #ffffff;
                }

                .delete-btn {
                    background: none;
                    border: none;
                    color: #ef4444;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 4px;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
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
                    min-width: 60px;
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
                    padding: 2px 2px;
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

                .timing-unit-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1px;
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
                    font-size: 9px;
                    color: #888;
                    margin-bottom: 0;
                    display: inline;
                    text-transform: uppercase;
                    line-height: 1;
                    white-space: nowrap;
                    min-width: 50px;
                    flex-shrink: 0;
                }

                .custom-number-input-container {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    gap: 2px;
                }

                .input-group-compact {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                }

                .grid-2 {
                    display: grid !important;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }

                .grid-3 {
                    display: grid !important;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 6px;
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
