import React, { useRef, useEffect } from 'react';

export function Timeline({ project, currentTime, duration, onClipSelect, selectedLayerId, onLayerSelect, onSeek }) {
    const pixelsPerSecond = 50;
    const totalWidth = (duration / 1000) * pixelsPerSecond;
    const trackHeaderWidth = 150;

    const rulerScrollRef = useRef(null);
    const lanesScrollRef = useRef(null);

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

    const handleTimelineClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const timeInSeconds = x / pixelsPerSecond;
        const timeInMs = timeInSeconds * 1000;
        if (onSeek) {
            onSeek(Math.max(0, Math.min(timeInMs, duration)));
        }
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
                        {project.layers.map(layer => (
                            <div
                                key={layer.id}
                                className={`track-lane ${selectedLayerId === layer.id ? 'selected' : ''}`}
                                onClick={handleTimelineClick}
                            >
                                {layer.clips.map(clip => {
                                    const clipWidth = (clip.duration / 1000) * pixelsPerSecond;
                                    const clipLeft = (clip.startTime / 1000) * pixelsPerSecond;

                                    return (
                                        <div
                                            key={clip.id}
                                            className="clip"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onClipSelect(clip.id);
                                            }}
                                            style={{
                                                left: clipLeft,
                                                width: clipWidth,
                                                backgroundColor: clip.type === 'effect' ? '#e82020' : '#4a90e2'
                                            }}
                                            title={`${clip.effectType || 'Clip'} | Start: ${(clip.startTime / 1000).toFixed(2)}s | Duration: ${(clip.duration / 1000).toFixed(2)}s`}
                                        >
                                            <span className="clip-label">{clip.effectType || 'Clip'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Playhead */}
                        <div className="playhead" style={{ left: (currentTime / 1000) * pixelsPerSecond }} />
                    </div>
                </div>
            </div>

            <style jsx>{`
                .timeline-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #151515;
                }
                .timeline-header-row {
                    display: flex;
                    border-bottom: 1px solid #333;
                    flex-shrink: 0;
                }
                .timeline-corner {
                    background: #1f1f1f;
                    border-right: 1px solid #333;
                    flex-shrink: 0;
                }
                .timeline-ruler-container {
                    flex: 1;
                    overflow-x: auto;
                    overflow-y: hidden;
                    scrollbar-width: none; /* Firefox */
                    -ms-overflow-style: none; /* IE/Edge */
                }
                .timeline-ruler-container::-webkit-scrollbar {
                    display: none; /* Chrome/Safari */
                }
                .ruler {
                    height: 40px;
                    position: relative;
                    background: #1a1a1a;
                }
                .ruler-mark {
                    position: absolute;
                    top: 0;
                    font-size: 10px;
                    color: #666;
                    border-left: 1px solid #333;
                    padding-left: 2px;
                    height: 100%;
                }
                .beat-marker {
                    position: absolute;
                    bottom: 0;
                    width: 2px;
                    height: 15px;
                    background: #4a90e2;
                    opacity: 0.6;
                }
                .onset-marker {
                    position: absolute;
                    bottom: 0;
                    width: 2px;
                    height: 10px;
                    background: #fbbf24;
                    opacity: 0.7;
                }
                .timeline-tracks-row {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }
                .track-headers-fixed {
                    flex-shrink: 0;
                    overflow-y: auto;
                    border-right: 1px solid #333;
                }
                .track-header {
                    height: 50px;
                    background: #1f1f1f;
                    display: flex;
                    align-items: center;
                    padding: 0 10px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 0.2s;
                    border-bottom: 1px solid #222;
                }
                .track-header:hover {
                    background: #2a2a2a;
                }
                .track-header.selected {
                    background: #2a2a2a;
                    border-left: 3px solid #e82020;
                }
                .track-lanes-container {
                    flex: 1;
                    overflow: auto;
                }
                .track-lanes {
                    position: relative;
                    min-height: 100%;
                }
                .track-lane {
                    height: 50px;
                    position: relative;
                    background: #151515;
                    border-bottom: 1px solid #222;
                    cursor: crosshair;
                }
                .track-lane.selected {
                    background: rgba(232, 32, 32, 0.05);
                }
                .clip {
                    position: absolute;
                    top: 5px;
                    bottom: 5px;
                    border-radius: 4px;
                    cursor: pointer;
                    opacity: 0.8;
                    display: flex;
                    align-items: center;
                    font-size: 11px;
                    overflow: hidden;
                    white-space: nowrap;
                    transition: opacity 0.1s;
                }
                .clip:hover {
                    opacity: 1;
                    outline: 2px solid white;
                    outline-offset: -2px;
                }
                .clip-label {
                    padding: 0 5px;
                }
                .playhead {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 2px;
                    background: #e82020;
                    z-index: 10;
                    pointer-events: none;
                }
            `}</style>
        </div>
    );
}
