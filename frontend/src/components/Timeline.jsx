import React, { useRef, useEffect, useState } from 'react';
import { ProjectState } from '../core/ProjectState';

export function Timeline({ project, currentTime, duration, zoom, snapMode, bpm, onClipSelect, selectedLayerId, onLayerSelect, onSeek, onProjectChange }) {
    const pixelsPerSecond = zoom || 50;
    const totalWidth = (duration / 1000) * pixelsPerSecond;
    const trackHeaderWidth = 150;

    const rulerScrollRef = useRef(null);
    const lanesScrollRef = useRef(null);

    const [draggingClip, setDraggingClip] = useState(null);
    const [dragOffset, setDragOffset] = useState(0); // Offset within clip in ms

    // Synchronize scroll between ruler and lanes
    const handleRulerScroll = (e) => {
        if (lanesScrollRef.current) {
            lanesScrollRef.current.scrollLeft = e.target.scrollLeft;
        }
    };

    const handleLanesScroll = (e) => {
        if (rulerScrollRef.current) {
            rulerScrollRef.current.scrollLeft = e.target.scrollLeft;
        }
    };

    // Generate time markers
    const markers = [];
    for (let i = 0; i < duration / 1000; i += 1) {
        markers.push(i);
    }

    // Get audio analysis markers
    const analysis = project.analysis;
    const beatMarkers = analysis?.beat_times || [];
    const onsetMarkers = analysis?.onset_times || [];
    // Dynamic snap interval
    let snapIntervalMs = null;
    if (snapMode !== 'off') {
        const beatDurationMs = (60 / (bpm || 120)) * 1000;
        const multiplier = snapMode === '1' ? 1
            : snapMode === '1/2' ? 0.5
                : snapMode === '1/4' ? 0.25
                    : 0.125;
        snapIntervalMs = beatDurationMs * multiplier;
    }

    // Prepare snap candidates (shared for seeking and dragging)
    const snapCandidates = [0, ...beatMarkers.map(t => t * 1000), ...onsetMarkers.map(t => t * 1000)];
    if (snapIntervalMs) {
        for (let t = 0; t <= duration; t += snapIntervalMs) {
            snapCandidates.push(t);
        }
    }

    const getSnappedTime = (timeMs) => {
        if (snapMode === 'off') return timeMs;
        const thresholdMs = 100 / (pixelsPerSecond / 50);
        let snappedTime = timeMs;
        let minDiff = thresholdMs;

        snapCandidates.forEach(snap => {
            const diff = Math.abs(timeMs - snap);
            if (diff < minDiff) {
                minDiff = diff;
                snappedTime = snap;
            }
        });
        return snappedTime;
    };

    const handleRulerMouseDown = (e) => {
        const rect = rulerScrollRef.current.getBoundingClientRect();

        const seek = (moveEvent) => {
            const x = moveEvent.clientX - rect.left + rulerScrollRef.current.scrollLeft;
            const timeInSeconds = x / pixelsPerSecond;
            const timeInMs = timeInSeconds * 1000;

            const snappedTimeMs = getSnappedTime(timeInMs);

            if (onSeek) {
                onSeek(Math.max(0, Math.min(snappedTimeMs, duration)));
            }
        };

        seek(e); // Initial seek on mouse down

        const handleMouseMove = (moveEvent) => {
            seek(moveEvent);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleDragStart = (e, clip, layerId) => {
        e.stopPropagation();
        onClipSelect(clip.id);
        onLayerSelect(layerId);

        const rect = e.currentTarget.getBoundingClientRect();
        const xInClipPx = e.clientX - rect.left;
        const xInClipMs = (xInClipPx / pixelsPerSecond) * 1000;

        setDraggingClip({ ...clip, originalStartTime: clip.startTime, layerId });
        setDragOffset(xInClipMs);

        const handleMouseMove = (moveEvent) => {
            const laneRect = lanesScrollRef.current.getBoundingClientRect();
            const xInLanePx = moveEvent.clientX - laneRect.left + lanesScrollRef.current.scrollLeft;
            let newTimeMs = (xInLanePx / pixelsPerSecond) * 1000 - xInClipMs;

            const snappedTime = getSnappedTime(newTimeMs);

            setDraggingClip(prev => ({ ...prev, startTime: Math.max(0, snappedTime) }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            setDraggingClip(prev => {
                if (prev && Math.abs(prev.startTime - prev.originalStartTime) > 1) {
                    // Save change using deep clone to ensure history snapshot works
                    const json = project.toJSON();
                    const newProject = ProjectState.fromJSONSync(json);
                    const layer = newProject.layers.find(l => l.id === prev.layerId);
                    if (layer) {
                        const clipIdx = layer.clips.findIndex(c => c.id === prev.id);
                        if (clipIdx !== -1) {
                            layer.clips[clipIdx].startTime = prev.startTime;
                            if (onProjectChange) onProjectChange(newProject);
                        }
                    }
                }
                return null;
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className="timeline-container">
            {/* Fixed header row */}
            <div className="timeline-header-row">
                <div className="timeline-corner" style={{ width: trackHeaderWidth }}>
                    {/* Empty corner */}
                </div>
                <div
                    className="timeline-ruler-container"
                    ref={rulerScrollRef}
                    onScroll={handleRulerScroll}
                    onMouseDown={handleRulerMouseDown}
                >
                    <div className="ruler" style={{ width: totalWidth }}>
                        {/* Time markers */}
                        {markers.map(s => (
                            <div
                                key={`time-${s}`}
                                className="ruler-mark"
                                style={{ left: s * pixelsPerSecond }}
                            >
                                {s}s
                            </div>
                        ))}

                        {/* Beat markers (blue) */}
                        {beatMarkers.map((time, idx) => (
                            <div
                                key={`beat-${idx}`}
                                className="beat-marker"
                                style={{ left: time * pixelsPerSecond }}
                                title={`Beat at ${time.toFixed(2)}s`}
                            />
                        ))}

                        {/* Onset markers (yellow) */}
                        {onsetMarkers.map((time, idx) => (
                            <div
                                key={`onset-${idx}`}
                                className="onset-marker"
                                style={{ left: time * pixelsPerSecond }}
                                title={`Onset at ${time.toFixed(2)}s`}
                            />
                        ))}

                        {/* Playhead in Ruler */}
                        <div className="playhead ruler-playhead" style={{ left: (currentTime / 1000) * pixelsPerSecond }} />
                    </div>
                </div>
            </div>

            {/* Tracks area with scroll */}
            <div className="timeline-tracks-row">
                {/* Fixed track headers */}
                <div className="track-headers-fixed" style={{ width: trackHeaderWidth }}>
                    {project.layers.map(layer => (
                        <div
                            key={layer.id}
                            className={`track-header ${selectedLayerId === layer.id ? 'selected' : ''}`}
                            onClick={() => onLayerSelect(layer.id)}
                        >
                            <span>{layer.name}</span>
                        </div>
                    ))}
                </div>

                {/* Scrollable track lanes */}
                <div
                    className="track-lanes-container"
                    ref={lanesScrollRef}
                    onScroll={handleLanesScroll}
                >
                    <div className="track-lanes" style={{ width: totalWidth }}>
                        {/* Grid lines */}
                        {snapIntervalMs && Array.from({ length: Math.ceil(duration / snapIntervalMs) + 1 }).map((_, i) => {
                            const t = i * snapIntervalMs;
                            return (
                                <div
                                    key={`grid-${t}`}
                                    className="grid-line"
                                    style={{ left: (t / 1000) * pixelsPerSecond }}
                                />
                            );
                        })}

                        {project.layers.map(layer => (
                            <div
                                key={layer.id}
                                className={`track-lane ${selectedLayerId === layer.id ? 'selected' : ''}`}
                            >
                                {layer.clips.map(clip => {
                                    const isDragging = draggingClip?.id === clip.id;
                                    const displayClip = isDragging ? draggingClip : clip;

                                    const clipWidth = (displayClip.duration / 1000) * pixelsPerSecond;
                                    const clipLeft = (displayClip.startTime / 1000) * pixelsPerSecond;

                                    return (
                                        <div
                                            key={clip.id}
                                            className={`clip ${isDragging ? 'dragging' : ''}`}
                                            onMouseDown={(e) => handleDragStart(e, clip, layer.id)}
                                            style={{
                                                left: clipLeft,
                                                width: clipWidth,
                                                backgroundColor: clip.type === 'effect' ? '#e82020' : '#4a90e2',
                                                zIndex: isDragging ? 20 : 1
                                            }}
                                            title={`${clip.effectType || 'Clip'} | Start: ${(displayClip.startTime / 1000).toFixed(2)}s | Duration: ${(clip.duration / 1000).toFixed(2)}s`}
                                        >
                                            <span className="clip-label">{clip.effectType || 'Clip'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Playhead in Tracks */}
                        <div className="playhead track-playhead" style={{ left: (currentTime / 1000) * pixelsPerSecond }} />
                    </div>
                </div>
            </div>

            <style jsx>{`
                .timeline-container { display: flex; flex-direction: column; height: 100%; background: #151515; user-select: none; }
                .timeline-header-row { display: flex; border-bottom: 1px solid #333; flex-shrink: 0; }
                .timeline-corner { background: #1f1f1f; border-right: 1px solid #333; flex-shrink: 0; }
                .timeline-ruler-container { flex: 1; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -ms-overflow-style: none; }
                .timeline-ruler-container::-webkit-scrollbar { display: none; }
                .ruler { height: 40px; position: relative; background: #1a1a1a; }
                .ruler-mark { position: absolute; top: 0; font-size: 10px; color: #666; border-left: 1px solid #333; padding-left: 2px; height: 100%; }
                .beat-marker { position: absolute; bottom: 0; width: 2px; height: 15px; background: #4a90e2; opacity: 0.6; }
                .onset-marker { position: absolute; bottom: 0; width: 2px; height: 10px; background: #fbbf24; opacity: 0.7; }
                .timeline-tracks-row { display: flex; flex: 1; overflow: hidden; }
                .track-headers-fixed { flex-shrink: 0; overflow-y: auto; border-right: 1px solid #333; }
                .track-header { height: 50px; background: #1f1f1f; display: flex; align-items: center; padding: 0 10px; font-size: 12px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #222; }
                .track-header:hover { background: #2a2a2a; }
                .track-header.selected { background: #2a2a2a; border-left: 3px solid #e82020; }
                .track-lanes-container { flex: 1; overflow: auto; }
                .track-lanes { position: relative; min-height: 100%; }
                .track-lane { height: 50px; position: relative; background: #151515; border-bottom: 1px solid #222; cursor: crosshair; }
                .track-lane.selected { background: rgba(232, 32, 32, 0.05); }
                .grid-line {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 1px;
                    background: rgba(255, 255, 255, 0.05);
                    pointer-events: none;
                    z-index: 0;
                }
                .clip { position: absolute; top: 5px; bottom: 5px; border-radius: 4px; cursor: move; opacity: 0.8; display: flex; align-items: center; font-size: 11px; overflow: hidden; white-space: nowrap; transition: opacity 0.1s; border: 1px solid rgba(255,255,255,0.1); }
                .clip:hover { opacity: 1; outline: 2px solid white; outline-offset: -2px; }
                .clip.dragging { opacity: 0.6; pointer-events: none; outline: 2px solid #e82020; box-shadow: 0 0 15px rgba(232, 32, 32, 0.5); }
                .clip-label { padding: 0 5px; pointer-events: none; }
                .playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #e82020; z-index: 10; pointer-events: none; }
            `}</style>
        </div>
    );
}
